// Briveon HQ: sign-in, tabs, shared state. Each tool lives in tools/.

import { SUPABASE_URL, SUPABASE_KEY, TEAM } from './config.js';
import { $, el, store, toast, friendly, isMissingTable, modal } from './lib/ui.js';
import { supabaseApi } from './lib/api.js';
import { demoApi, DEMO_USER } from './lib/demo.js';
import * as board from './tools/board.js';
import * as vault from './tools/vault.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

// Local preview without Supabase: http://localhost:5173/admin/?demo
// Only works on localhost, data lives in memory and resets on reload.
const DEMO =
  new URLSearchParams(location.search).has('demo') && ['localhost', '127.0.0.1'].includes(location.hostname);

const VIEWS = ['loading', 'setup', 'login', 'app'];
const TABS = ['board', 'vault'];

let sb = null;
let user = null;
let unsubscribe = null;
let toolsReady = false;

const ctx = {
  api: null,
  state: {
    person: store.get('person', 'all'),
    projects: new Map(),
    profiles: new Map(),
    schemaReady: false,
  },
  get user() {
    return user;
  },
  nameOf: (id) => ctx.state.profiles.get(id) || 'Someone',
};

function show(name) {
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
}

// ---------- Boot + auth ----------

async function boot() {
  buildPeopleFilter();

  if (DEMO) {
    ctx.api = demoApi();
    window.__hq = { api: ctx.api, vault, board };
    enterApp(DEMO_USER);
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    show('setup');
    return;
  }

  try {
    const { createClient } = await import(SUPABASE_CDN);
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (err) {
    show('setup');
    toast(`Couldn't load Supabase: ${err.message}`, 8000);
    return;
  }

  ctx.api = supabaseApi(sb, () => user?.id);
  // Supabase advises not to await its own calls inside this callback.
  sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onSession(session), 0));
}

function onSession(session) {
  const next = session?.user ?? null;
  if (next && next.id === user?.id) return;
  if (next) enterApp(next);
  else {
    leaveApp();
    show('login');
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = $('#login-error');
  const button = form.querySelector('button[type=submit]');
  const email = form.email.value.trim();
  const password = form.password.value;

  errorEl.textContent = '';
  if (!email || !password) {
    errorEl.textContent = 'Enter your email and password.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  button.disabled = false;
  button.textContent = 'Sign in';

  if (error) {
    errorEl.textContent = /invalid/i.test(error.message) ? 'Wrong email or password.' : friendly(error);
    form.password.select();
  } else {
    form.reset();
  }
});

$('#sign-out').addEventListener('click', async () => {
  if (vault.isDirty() && !confirm('You have unsaved note changes. Sign out anyway?')) return;
  vault.discard();
  if (DEMO) {
    location.href = './';
    return;
  }
  await sb.auth.signOut();
});

async function loadShared() {
  const { api, state } = ctx;
  try {
    const [projects, profiles] = await Promise.all([api.listProjects(), api.listProfiles()]);
    await api.listNotes(); // also proves the notes table exists
    state.projects = new Map(projects.map((p) => [p.name, p.color]));
    state.profiles = new Map(profiles.map((p) => [p.id, p.name]));
    state.schemaReady = true;
  } catch (err) {
    state.schemaReady = false;
    if (!isMissingTable(err)) toast(friendly(err), 8000);
  }
  $('#schema-banner').hidden = state.schemaReady;
}

async function askWhoAmI() {
  const name = await modal({
    title: 'Who are you?',
    body: el('p', { class: 'muted', text: 'HQ uses this for "edited by" labels and the team filter. You only pick once.' }),
    buttons: TEAM.map((t) => ({ label: t, value: t, primary: true })),
  });
  if (!name) return;
  try {
    const row = await ctx.api.setMyName(name);
    ctx.state.profiles.set(row.id, row.name);
  } catch (err) {
    toast(friendly(err), 8000);
  }
}

async function enterApp(nextUser) {
  user = nextUser;
  $('#hq-email').textContent = user.email;
  show('app');

  if (!toolsReady) {
    board.init(ctx);
    vault.init(ctx);
    toolsReady = true;
  }

  await loadShared();

  let admin = false;
  try {
    admin = await ctx.api.isAdmin();
    if (!admin) {
      toast(`${user.email} isn't in the admins table yet, so everything stays empty. See README, Admin setup.`, 12000);
    }
  } catch {
    /* base schema not installed: board.load reports it */
  }

  await Promise.all([board.load(), vault.load()]);
  route();

  const tables = ctx.state.schemaReady ? ['tasks', 'notes', 'projects', 'profiles'] : ['tasks'];
  unsubscribe = ctx.api.subscribe(tables, onRemote, (status) => {
    const live = status === 'SUBSCRIBED';
    $('#sync').classList.toggle('live', live);
    $('#sync-label').textContent = live ? 'Live' : 'Offline';
  });

  if (admin && ctx.state.schemaReady && !ctx.state.profiles.has(user.id)) await askWhoAmI();
}

function leaveApp() {
  unsubscribe?.();
  unsubscribe = null;
  user = null;
  board.clear();
  vault.clear();
}

function onRemote(table, payload) {
  const { state } = ctx;
  if (table === 'tasks') board.onRemote(payload);
  else if (table === 'notes') vault.onRemote(payload);
  else if (table === 'projects') {
    if (payload.eventType === 'DELETE') state.projects.delete(payload.old.name);
    else state.projects.set(payload.new.name, payload.new.color);
    board.render();
  } else if (table === 'profiles') {
    if (payload.eventType !== 'DELETE') state.profiles.set(payload.new.id, payload.new.name);
    vault.render();
  }
}

window.addEventListener('focus', () => {
  if (!user) return;
  board.load();
  vault.load();
});

// ---------- Team filter ----------

function buildPeopleFilter() {
  const people = $('#filter-people');
  for (const name of ['all', ...TEAM]) {
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'data-person': name,
      'aria-pressed': String(ctx.state.person === name),
      text: name === 'all' ? 'Everyone' : name,
    });
    chip.addEventListener('click', () => {
      ctx.state.person = name;
      store.set('person', name);
      people.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      board.render();
      vault.render();
    });
    people.append(chip);
  }
}

// ---------- Tabs ----------

function route() {
  let hash = location.hash.slice(1);
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* keep it as typed */
  }
  const [first, ...rest] = hash.split('/');
  const tab = TABS.includes(first) ? first : store.get('tab', 'board');
  store.set('tab', tab);

  for (const t of TABS) {
    $(`#tool-${t}`).hidden = t !== tab;
    const link = $(`#tab-${t}`);
    if (t === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (tab === 'vault' && rest.length) vault.openPath(rest.join('/'));
}

window.addEventListener('hashchange', () => {
  if (user) route();
});

document.addEventListener('keydown', (e) => {
  if (!user) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!location.hash.startsWith('#vault')) location.hash = '#vault';
    vault.focusSearch();
  }
});

boot();
