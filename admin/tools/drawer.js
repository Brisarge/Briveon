// Task details drawer: status, linked notes and the task's discussion.

import { el, toast, friendly } from '../lib/ui.js';
import { taskColor, projectColor } from '../lib/colors.js';
import { createThread, createPicker } from '../lib/thread.js';

const STATUSES = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

let ctx;
let board;
let currentId = null;
let thread = null;
let parts = null;
let picker = null;
const dialog = el('dialog', { class: 'drawer', 'aria-labelledby': 'drawer-title' });

export function init(context, boardTool) {
  ctx = context;
  board = boardTool;
  document.body.append(dialog);
  dialog.addEventListener('close', onClosed);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
}

export const currentTask = () => currentId;

export function close() {
  if (dialog.open) dialog.close();
}

function onClosed() {
  currentId = null;
  thread = null;
  parts = null;
  picker = null;
  dialog.replaceChildren();
  if (location.hash.startsWith('#board/')) {
    history.replaceState(null, '', `${location.pathname}${location.search}#board`);
  }
}

export function open(id) {
  const task = board.get(id);
  if (!task) {
    if (id) toast('That task no longer exists.');
    return;
  }
  if (currentId === id && dialog.open) return;

  currentId = id;
  thread = createThread(ctx, { task_id: id });

  const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', text: '✕' });
  closeBtn.addEventListener('click', close);
  const editBtn = el('button', { class: 'btn btn-small', type: 'button', text: 'Edit' });
  editBtn.addEventListener('click', () => {
    const t = board.get(currentId);
    if (t) board.openDialog(t);
  });

  const bundleBtn = el('button', { class: 'btn btn-small', type: 'button', text: 'Add to AI bundle' });
  bundleBtn.addEventListener('click', () => ctx.addTaskToBundle(currentId));

  parts = {
    tag: el('span', { class: 'tag' }),
    title: el('h2', { id: 'drawer-title' }),
    who: el('p', { class: 'drawer-who' }),
    notes: el('p', { class: 'drawer-notes' }),
    statuses: el('div', { class: 'chips', role: 'group', 'aria-label': 'Status' }),
    links: el('div', { class: 'drawer-links' }),
    addLink: el('button', { class: 'btn btn-small', type: 'button', text: '+ Link a note', 'aria-expanded': 'false' }),
    pickerSlot: el('div', {}),
    head: null,
  };
  parts.addLink.addEventListener('click', togglePicker);

  STATUSES.forEach((s) => {
    const chip = el('button', { class: 'chip', type: 'button', 'data-status': s.key, text: s.label });
    chip.addEventListener('click', () => setStatus(s.key));
    parts.statuses.append(chip);
  });

  parts.head = el('header', { class: 'drawer-head' }, [
    el('div', { class: 'drawer-heading' }, [parts.tag, parts.title, parts.who]),
    editBtn,
    closeBtn,
  ]);

  dialog.replaceChildren(
    parts.head,
    el('div', { class: 'drawer-scroll' }, [
      el('div', { class: 'drawer-actions' }, [parts.statuses, bundleBtn]),
      parts.notes,
      el('section', { class: 'drawer-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Linked notes' }), parts.addLink]),
        parts.pickerSlot,
        parts.links,
      ]),
      el('section', { class: 'drawer-section' }, [el('h3', { text: 'Discussion' }), thread.el]),
    ]),
  );

  refresh();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.drawer-scroll').scrollTop = 0;
  history.replaceState(null, '', `${location.pathname}${location.search}#board/${id}`);
}

export function refresh() {
  if (!currentId || !parts) return;
  const task = board.get(currentId);
  if (!task) {
    toast('This task was deleted.');
    close();
    return;
  }

  const projects = ctx.state.projects;
  dialog.style.setProperty('--task-color', taskColor(task, projects) || 'var(--line)');
  parts.tag.textContent = task.project || '';
  parts.tag.hidden = !task.project;
  parts.tag.style.color = projectColor(task.project, projects) || '';
  parts.title.textContent = task.title;
  parts.who.textContent = task.assignee ? `Assigned to ${task.assignee}` : 'Unassigned';
  parts.notes.textContent = task.notes || '';
  parts.notes.hidden = !task.notes;
  parts.statuses
    .querySelectorAll('.chip')
    .forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.status === task.status)));

  const linked = ctx.data.links
    .filter((l) => l.task_id === currentId)
    .map((l) => ctx.getNote(l.note_id))
    .filter(Boolean);
  parts.links.replaceChildren(
    ...(linked.length
      ? linked.map((note) => {
          const open = el('button', { class: 'linked-note', type: 'button', title: `Open ${note.path}` }, [
            el('b', { text: note.path.split('/').pop().replace(/\.md$/i, '') }),
            el('small', { text: note.path }),
          ]);
          open.addEventListener('click', () => ctx.openNote(note.id));
          const unlink = el('button', { class: 'unlink', type: 'button', text: 'Unlink', 'aria-label': `Unlink ${note.path}` });
          unlink.addEventListener('click', () => removeLink(note.id));
          return el('div', { class: 'linked-row' }, [open, unlink]);
        })
      : [el('p', { class: 'thread-empty', text: 'No notes linked yet.' })]),
  );

  picker?.refresh();
  thread.refresh();
}

async function setStatus(status) {
  const task = board.get(currentId);
  if (!task || task.status === status) return;
  await board.moveTo(task, status);
  refresh();
}

function togglePicker() {
  if (picker) {
    picker = null;
    parts.pickerSlot.replaceChildren();
    parts.addLink.setAttribute('aria-expanded', 'false');
    return;
  }
  picker = createPicker({
    placeholder: 'Search notes to link',
    items: () => {
      const linked = new Set(ctx.data.links.filter((l) => l.task_id === currentId).map((l) => l.note_id));
      return ctx
        .listNotes()
        .filter((n) => !linked.has(n.id))
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((n) => ({ id: n.id, label: n.path.split('/').pop().replace(/\.md$/i, ''), sub: n.path }));
    },
    onPick: async (item) => {
      try {
        const row = await ctx.api.linkNote(currentId, item.id);
        ctx.data.addLink(row);
        togglePicker();
        ctx.changed();
      } catch (err) {
        toast(friendly(err), 6000);
      }
    },
  });
  parts.pickerSlot.replaceChildren(picker.el);
  parts.addLink.setAttribute('aria-expanded', 'true');
  picker.focus();
}

async function removeLink(noteId) {
  try {
    await ctx.api.unlinkNote(currentId, noteId);
    ctx.data.removeLink(currentId, noteId);
    ctx.changed();
  } catch (err) {
    toast(friendly(err), 6000);
  }
}
