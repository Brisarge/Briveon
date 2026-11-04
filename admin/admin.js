import { SUPABASE_URL, SUPABASE_KEY, TEAM, PROJECTS } from './config.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

// Local preview without Supabase: http://localhost:5173/admin/?demo
// Only works on localhost, data lives in memory and resets on reload.
const DEMO =
  new URLSearchParams(location.search).has('demo') && ['localhost', '127.0.0.1'].includes(location.hostname);

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`hq.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`hq.${key}`, value);
    } catch {
      /* private mode etc. */
    }
  },
};

// ---------- Views ----------

const VIEWS = ['loading', 'setup', 'login', 'app'];
function show(name) {
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
}

let toastTimer;
function toast(message, ms = 4000) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

function friendly(err) {
  const msg = err?.message || String(err);
  if (err?.code === '42501' || err?.code === 'PGRST116' || /row-level security/i.test(msg)) {
    return "Not allowed. Is your email in the admins table? (README, Admin setup)";
  }
  if (/failed to fetch|networkerror/i.test(msg)) return 'Network error. Check your connection and try again.';
  return msg;
}

// ---------- Data layer (Supabase or in-memory demo) ----------

function supabaseApi(sb) {
  const check = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  return {
    list: async () => check(await sb.from('tasks').select('*').order('position')),
    insert: async (row) => check(await sb.from('tasks').insert(row).select().single()),
    update: async (id, patch) => check(await sb.from('tasks').update(patch).eq('id', id).select().single()),
    remove: async (id) => check(await sb.from('tasks').delete().eq('id', id)),
    isAdmin: async () => check(await sb.rpc('is_admin')),
    subscribe(onChange, onStatus) {
      const channel = sb
        .channel('tasks-board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
        .subscribe(onStatus);
      return () => sb.removeChannel(channel);
    },
  };
}

function demoApi() {
  const now = Date.now();
  let rows = [
    { title: 'Write blurbs for Climb of Chaos and Tower Destruction', project: 'Website', assignee: 'Bris', status: 'todo' },
    { title: 'Playtest Labyrinth floor 3 on mobile', project: 'Labyrinth', assignee: 'Rog', status: 'todo', notes: 'Moving platforms felt off on touch controls.' },
    { title: 'Boss repeat: UTC midnight or rolling 24 h?', project: 'RealmNG', assignee: 'Both', status: 'doing' },
    { title: 'Swap DEV product IDs for the public ones', project: 'RealmNG', assignee: 'Bris', status: 'done' },
  ].map((r, i) => ({ id: crypto.randomUUID(), notes: '', position: now - 10000 + i * 1000, created_at: new Date().toISOString(), ...r }));

  const copy = (r) => ({ ...r });
  return {
    list: async () => rows.map(copy),
    insert: async (row) => {
      const r = { id: crypto.randomUUID(), notes: '', created_at: new Date().toISOString(), ...row };
      rows.push(r);
      return copy(r);
    },
    update: async (id, patch) => {
      const r = rows.find((x) => x.id === id);
      Object.assign(r, patch);
      return copy(r);
    },
    remove: async (id) => {
      rows = rows.filter((x) => x.id !== id);
    },
    isAdmin: async () => true,
    subscribe(_onChange, onStatus) {
      onStatus('SUBSCRIBED');
      return () => {};
    },
  };
}

// ---------- State ----------

let sb = null;
let api = null;
let user = null;
let unsubscribe = null;
let dragging = null;
let renderPending = false;

const state = {
  tasks: new Map(),
  person: store.get('person', 'all'),
  project: store.get('project', 'all'),
  editingId: null,
};

// ---------- Boot + auth ----------

async function boot() {
  buildStaticUI();

  if (DEMO) {
    api = demoApi();
    enterApp({ id: 'demo', email: 'demo mode (localhost)' });
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

  api = supabaseApi(sb);
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
  if (DEMO) {
    location.href = './';
    return;
  }
  await sb.auth.signOut();
});

async function enterApp(nextUser) {
  user = nextUser;
  $('#hq-email').textContent = user.email;
  show('app');
  await loadTasks();

  unsubscribe = api.subscribe(onRemoteChange, (status) => {
    const live = status === 'SUBSCRIBED';
    $('#sync').classList.toggle('live', live);
    $('#sync-label').textContent = live ? 'Live' : 'Offline';
  });

  try {
    if (!(await api.isAdmin())) {
      toast(`${user.email} isn't in the admins table yet, so the board stays empty. See README, Admin setup.`, 12000);
    }
  } catch {
    /* schema not installed yet: loadTasks already reported it */
  }
}

function leaveApp() {
  unsubscribe?.();
  unsubscribe = null;
  user = null;
  state.tasks.clear();
}

async function loadTasks() {
  try {
    const rows = await api.list();
    state.tasks = new Map(rows.map((r) => [r.id, r]));
    render();
  } catch (err) {
    toast(
      /relation .*tasks.* does not exist|could not find the table/i.test(err.message)
        ? 'The tasks table is missing. Run supabase/schema.sql first.'
        : friendly(err),
      8000,
    );
  }
}

function onRemoteChange(payload) {
  if (payload.eventType === 'DELETE') state.tasks.delete(payload.old.id);
  else state.tasks.set(payload.new.id, payload.new);
  scheduleRender();
}

window.addEventListener('focus', () => {
  if (user) loadTasks();
});

// ---------- Board UI ----------

const columnEls = {};

function buildStaticUI() {
  // People filter
  const people = $('#filter-people');
  for (const name of ['all', ...TEAM]) {
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'data-person': name,
      'aria-pressed': String(state.person === name),
      text: name === 'all' ? 'Everyone' : name,
    });
    chip.addEventListener('click', () => {
      state.person = name;
      store.set('person', name);
      people.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    });
    people.append(chip);
  }

  $('#filter-project').addEventListener('change', (e) => {
    state.project = e.target.value;
    store.set('project', state.project);
    render();
  });

  // Assignee options in the dialog
  const assignee = $('#assignee-select');
  assignee.append(el('option', { value: '', text: 'Unassigned' }));
  for (const name of [...TEAM, 'Both']) assignee.append(el('option', { value: name, text: name }));

  // Columns
  const board = $('#board-columns');
  for (const col of COLUMNS) {
    const count = el('span', { class: 'col-count', text: '0' });
    const list = el('ul', { class: 'col-list', 'data-status': col.key, 'aria-label': col.label });
    const add = el('button', { class: 'col-add', type: 'button', text: '+ Add task' });
    add.addEventListener('click', () => openDialog(null, col.key));
    const section = el('section', { class: `col col-${col.key}` }, [
      el('header', { class: 'col-head' }, [el('h2', { text: col.label }), count]),
      list,
      add,
    ]);
    setupDropZone(list);
    board.append(section);
    columnEls[col.key] = { list, count };
  }

  $('#new-task').addEventListener('click', () => openDialog(null, 'todo'));
}

function matchesFilters(task) {
  if (state.person !== 'all' && task.assignee !== state.person && task.assignee !== 'Both') return false;
  if (state.project !== 'all' && (task.project || '') !== state.project) return false;
  return true;
}

function allProjects() {
  const set = new Set(PROJECTS);
  for (const t of state.tasks.values()) if (t.project) set.add(t.project);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function render() {
  renderPending = false;
  const tasks = [...state.tasks.values()].sort((a, b) => a.position - b.position);
  const visible = tasks.filter(matchesFilters);

  for (const col of COLUMNS) {
    const { list, count } = columnEls[col.key];
    const items = visible.filter((t) => t.status === col.key);
    list.replaceChildren(el('li', { class: 'empty', text: 'Nothing here' }), ...items.map(taskCard));
    count.textContent = String(items.length);
  }

  // Project filter + suggestions
  const projects = allProjects();
  if (state.project !== 'all' && !projects.includes(state.project)) state.project = 'all';
  const select = $('#filter-project');
  select.replaceChildren(
    el('option', { value: 'all', text: 'All projects' }),
    ...projects.map((p) => el('option', { value: p, text: p })),
  );
  select.value = state.project;
  $('#project-options').replaceChildren(...projects.map((p) => el('option', { value: p })));
}

function scheduleRender() {
  if (dragging || $('#task-dialog').open) renderPending = true;
  else render();
}

function initials(name) {
  return name === 'Both' ? '2' : name.slice(0, 1).toUpperCase();
}

function taskCard(task) {
  const top = el('div', { class: 'task-top' });
  if (task.project) top.append(el('span', { class: 'tag', text: task.project }));
  if (task.assignee) {
    top.append(
      el('span', {
        class: `avatar avatar-${task.assignee.toLowerCase()}`,
        title: task.assignee,
        'aria-label': `Assigned to ${task.assignee}`,
        text: initials(task.assignee),
      }),
    );
  }

  const open = el('button', { class: 'task-open', type: 'button' }, [
    top.childNodes.length ? top : null,
    el('h3', { text: task.title }),
    task.notes ? el('p', { class: 'task-notes', text: task.notes }) : null,
  ]);
  open.addEventListener('click', () => openDialog(task));

  const li = el('li', { class: 'task', draggable: 'true', 'data-id': task.id }, open);
  li.addEventListener('dragstart', (e) => {
    dragging = li;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    requestAnimationFrame(() => li.classList.add('dragging'));
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    const dropped = li.dataset.dropped === '1';
    dragging = null;
    if (!dropped || renderPending) render();
  });
  return li;
}

function cardAfter(list, y) {
  for (const card of list.querySelectorAll('.task:not(.dragging)')) {
    const box = card.getBoundingClientRect();
    if (y < box.top + box.height / 2) return card;
  }
  return null;
}

function setupDropZone(list) {
  list.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drop-target').forEach((n) => n !== list && n.classList.remove('drop-target'));
    list.classList.add('drop-target');
    const after = cardAfter(list, e.clientY);
    if (after) list.insertBefore(dragging, after);
    else list.append(dragging);
  });

  list.addEventListener('drop', (e) => {
    if (!dragging) return;
    e.preventDefault();
    dragging.dataset.dropped = '1';
    commitMove(dragging.dataset.id, list.dataset.status, dragging);
  });
}

async function commitMove(id, status, node) {
  const task = state.tasks.get(id);
  if (!task) return;

  const neighbor = (n, dir) => {
    let sib = n[dir];
    while (sib && !sib.classList.contains('task')) sib = sib[dir];
    return sib ? state.tasks.get(sib.dataset.id) : null;
  };
  const prev = neighbor(node, 'previousElementSibling');
  const next = neighbor(node, 'nextElementSibling');

  let position;
  if (prev && next) position = (prev.position + next.position) / 2;
  else if (prev) position = prev.position + 1000;
  else if (next) position = next.position - 1000;
  else position = Date.now();

  const samePlace =
    task.status === status && (!prev || prev.position < task.position) && (!next || task.position < next.position);
  if (samePlace) return; // dropped where it already was

  const before = { ...task };
  Object.assign(task, { status, position });
  try {
    const row = await api.update(id, { status, position });
    state.tasks.set(row.id, row);
  } catch (err) {
    state.tasks.set(id, before);
    toast(friendly(err));
  }
  scheduleRender();
}

// ---------- Task dialog ----------

const dialog = $('#task-dialog');
const form = $('#task-form');

function openDialog(task, status = 'todo') {
  state.editingId = task?.id ?? null;
  $('#task-dialog-title').textContent = task ? 'Edit task' : 'New task';
  $('#task-delete').hidden = !task;
  $('#task-error').textContent = '';
  form.title.value = task?.title ?? '';
  form.notes.value = task?.notes ?? '';
  form.status.value = task?.status ?? status;
  form.assignee.value = task?.assignee ?? (state.person !== 'all' ? state.person : '');
  form.project.value = task?.project ?? (state.project !== 'all' ? state.project : '');
  dialog.showModal();
  form.title.focus();
}

function closeDialog() {
  dialog.close();
}

dialog.addEventListener('close', () => {
  state.editingId = null;
  if (renderPending) render();
});

$('#task-close').addEventListener('click', closeDialog);
$('#task-cancel').addEventListener('click', closeDialog);
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) closeDialog(); // backdrop click
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = form.title.value.trim();
  if (!title) {
    $('#task-error').textContent = 'Give the task a title.';
    form.title.focus();
    return;
  }

  const values = {
    title,
    notes: form.notes.value.trim(),
    status: form.status.value,
    assignee: form.assignee.value || null,
    project: form.project.value.trim() || null,
  };

  const save = $('#task-save');
  save.disabled = true;
  try {
    const id = state.editingId;
    const existing = id ? state.tasks.get(id) : null;
    let row;
    if (existing) {
      const patch = { ...values };
      if (existing.status !== values.status) patch.position = Date.now(); // moved column: put it at the bottom
      row = await api.update(id, patch);
    } else {
      row = await api.insert({ ...values, position: Date.now() });
    }
    state.tasks.set(row.id, row);
    closeDialog();
    render();
  } catch (err) {
    $('#task-error').textContent = friendly(err);
  } finally {
    save.disabled = false;
  }
});

$('#task-delete').addEventListener('click', async () => {
  const id = state.editingId;
  const task = id && state.tasks.get(id);
  if (!task || !confirm(`Delete "${task.title}"?`)) return;
  try {
    await api.remove(id);
    state.tasks.delete(id);
    closeDialog();
    render();
  } catch (err) {
    $('#task-error').textContent = friendly(err);
  }
});

boot();
