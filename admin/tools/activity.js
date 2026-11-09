// Activity tab: what's been happening across tasks, notes and discussions.

import { $, el, store, toast, friendly, timeAgo } from '../lib/ui.js';

const PAGE = 60;
const STATUS_LABEL = { todo: 'To do', doing: 'Doing', done: 'Done' };
const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'task', label: 'Tasks' },
  { key: 'note', label: 'Notes' },
  { key: 'comment', label: 'Comments' },
];

let ctx;
let items = new Map();
let kind = 'all';
let hasMore = false;
let visible = false;
let seenAt = store.get('activitySeen', '');

const feed = $('#activity-feed');
const more = $('#activity-more');
const badge = $('#activity-badge');

const group = (row) => (row.kind === 'comment' ? 'comment' : row.kind.split('_')[0]);
const short = (path) => path.split('/').pop().replace(/\.md$/i, '');

export function init(context) {
  ctx = context;

  const chips = $('#activity-kinds');
  KINDS.forEach((k) => {
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(k.key === kind),
      text: k.label,
    });
    chip.addEventListener('click', () => {
      kind = k.key;
      chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    });
    chips.append(chip);
  });

  more.addEventListener('click', loadOlder);
}

export async function load() {
  if (!ctx.state.threadsReady) {
    feed.replaceChildren(el('p', { class: 'tree-empty', text: 'Needs the database update (see the banner above).' }));
    return;
  }
  try {
    const rows = await ctx.api.listActivity({ limit: PAGE });
    hasMore = rows.length === PAGE;
    // Keep older pages already loaded, refresh the newest.
    rows.forEach((r) => items.set(r.id, r));
    render();
  } catch (err) {
    toast(friendly(err), 8000);
  }
}

async function loadOlder() {
  const oldest = sorted().at(-1);
  if (!oldest) return;
  more.disabled = true;
  try {
    const rows = await ctx.api.listActivity({ before: oldest.created_at, limit: PAGE });
    hasMore = rows.length === PAGE;
    rows.forEach((r) => items.set(r.id, r));
    render();
  } catch (err) {
    toast(friendly(err), 6000);
  } finally {
    more.disabled = false;
  }
}

export function onRemote(payload) {
  if (payload.eventType === 'DELETE') items.delete(payload.old.id);
  else items.set(payload.new.id, payload.new);
  render();
}

export function clear() {
  items = new Map();
  feed.replaceChildren();
  badge.hidden = true;
}

export function setVisible(isVisible) {
  visible = isVisible;
  if (visible) markSeen();
  renderBadge();
}

function markSeen() {
  seenAt = new Date().toISOString();
  store.set('activitySeen', seenAt);
}

function sorted() {
  return [...items.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

function renderBadge() {
  const count = visible
    ? 0
    : [...items.values()].filter((r) => r.actor !== ctx.user?.id && (!seenAt || r.created_at > seenAt)).length;
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? '99+' : String(count);
}

function dayLabel(iso) {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// The thing an entry is about, as a link when it still exists.
function subject(row, text) {
  const task = row.task_id && ctx.getTask(row.task_id);
  const note = row.note_id && ctx.getNote(row.note_id);
  if (task || note) {
    const link = el('button', { class: 'activity-link', type: 'button', text });
    link.addEventListener('click', () => (task ? ctx.openTask(task.id) : ctx.openNote(note.id)));
    return link;
  }
  return el('b', { text });
}

function describe(row) {
  const s = (t) => subject(row, t);
  switch (row.kind) {
    case 'task_created':
      return ['added task ', s(row.title)];
    case 'task_moved':
      return ['moved ', s(row.title), ` to ${STATUS_LABEL[row.detail] || row.detail}`];
    case 'task_assigned':
      return row.detail ? ['assigned ', s(row.title), ` to ${row.detail}`] : ['unassigned ', s(row.title)];
    case 'task_edited':
      return ['edited task ', s(row.title)];
    case 'task_deleted':
      return ['deleted task ', s(row.title)];
    case 'note_created':
      return row.item_count > 1 ? [`added ${row.item_count} notes`] : ['added note ', s(short(row.title))];
    case 'note_edited':
      return ['edited ', s(short(row.title))];
    case 'note_moved':
      return ['moved ', s(short(row.title)), ` from ${row.detail}`];
    case 'note_deleted':
      return ['deleted note ', s(short(row.title))];
    case 'note_linked':
      return ['linked ', el('b', { text: short(row.detail || '') }), ' to ', s(row.title)];
    case 'comment':
      return ['commented on ', s(row.note_id ? short(row.title) : row.title)];
    default:
      return [s(row.title)];
  }
}

export function render() {
  if (!ctx.state.threadsReady) return;
  if (visible) markSeen();

  const person = ctx.state.person;
  const rows = sorted().filter(
    (r) => (kind === 'all' || group(r) === kind) && (person === 'all' || ctx.nameOf(r.actor) === person),
  );

  const nodes = [];
  let lastDay = '';
  for (const row of rows) {
    const label = dayLabel(row.created_at);
    if (label !== lastDay) {
      nodes.push(el('h2', { class: 'activity-day', text: label }));
      lastDay = label;
    }
    const entry = el('article', { class: `activity-entry kind-${group(row)}` }, [
      el('p', { class: 'activity-text' }, [el('b', { text: ctx.nameOf(row.actor) }), ' ', ...describe(row)]),
      row.kind === 'comment' && row.detail ? el('p', { class: 'activity-quote', text: row.detail }) : null,
      el('time', { datetime: row.created_at, title: new Date(row.created_at).toLocaleString(), text: timeAgo(row.created_at) }),
    ]);
    nodes.push(entry);
  }

  feed.replaceChildren(...(nodes.length ? nodes : [el('p', { class: 'tree-empty', text: 'Nothing here yet.' })]));
  more.hidden = !hasMore;
  renderBadge();
}
