// Task board: columns, drag and drop, quick actions, task dialog, color coding.

import { $, el, store, toast, friendly, confirmModal, modal } from '../lib/ui.js';
import { taskColor, projectColor, swatchPicker } from '../lib/colors.js';
import { PROJECTS, TEAM } from '../config.js';

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

let ctx;
let tasks = new Map();
let project = store.get('project', 'all');
let editingId = null;
let editingColor = null;
let dragging = null;
let renderPending = false;
const columnEls = {};

const dialog = $('#task-dialog');
const form = $('#task-form');

export function init(context) {
  ctx = context;

  $('#filter-project').addEventListener('change', (e) => {
    project = e.target.value;
    store.set('project', project);
    render();
  });

  const assignee = $('#assignee-select');
  assignee.append(el('option', { value: '', text: 'Unassigned' }));
  for (const name of [...TEAM, 'Both']) assignee.append(el('option', { value: name, text: name }));

  const board = $('#board-columns');
  for (const col of COLUMNS) {
    const count = el('span', { class: 'col-count', text: '0' });
    const list = el('ul', { class: 'col-list', 'data-status': col.key, 'aria-label': col.label });
    const add = el('button', { class: 'col-add', type: 'button', text: '+ Add task' });
    add.addEventListener('click', () => openDialog(null, col.key));
    setupDropZone(list);
    board.append(
      el('section', { class: `col col-${col.key}` }, [
        el('header', { class: 'col-head' }, [el('h2', { text: col.label }), count]),
        list,
        add,
      ]),
    );
    columnEls[col.key] = { list, count };
  }

  $('#new-task').addEventListener('click', () => openDialog(null, 'todo'));
  $('#project-colors').addEventListener('click', openProjectColors);

  $('#task-close').addEventListener('click', closeDialog);
  $('#task-cancel').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    editingId = null;
    if (renderPending) render();
  });
  form.addEventListener('submit', onSubmit);
  $('#task-delete').addEventListener('click', onDelete);
}

export async function load() {
  try {
    const rows = await ctx.api.listTasks();
    tasks = new Map(rows.map((r) => [r.id, r]));
    render();
  } catch (err) {
    toast(friendly(err), 8000);
  }
}

export function onRemote(payload) {
  if (payload.eventType === 'DELETE') tasks.delete(payload.old.id);
  else tasks.set(payload.new.id, payload.new);
  scheduleRender();
}

export function clear() {
  tasks.clear();
}

export const get = (id) => tasks.get(id);
export const list = () => [...tasks.values()];

const noteName = (path) => path.split('/').pop().replace(/\.md$/i, '');

// Moves a task to the bottom of another column.
export async function moveTo(task, status) {
  const before = { ...task };
  Object.assign(task, { status, position: Date.now() });
  ctx.changed();
  try {
    const row = await ctx.api.updateTask(task.id, { status, position: task.position });
    tasks.set(row.id, row);
  } catch (err) {
    tasks.set(task.id, before);
    toast(friendly(err));
  }
  ctx.changed();
}

function taskFooter(task) {
  const foot = el('div', { class: 'task-foot' });

  if (ctx.state.threadsReady) {
    const linked = ctx.data.links
      .filter((l) => l.task_id === task.id)
      .map((l) => ctx.getNote(l.note_id))
      .filter(Boolean);
    linked.slice(0, 2).forEach((note) => {
      const chip = el('button', { class: 'note-chip', type: 'button', title: `Open ${note.path}`, text: noteName(note.path) });
      chip.addEventListener('click', () => ctx.openNote(note.id));
      foot.append(chip);
    });
    if (linked.length > 2) foot.append(el('span', { class: 'task-count', text: `+${linked.length - 2} notes` }));

    const count = [...ctx.data.comments.values()].filter((c) => c.task_id === task.id).length;
    if (count) foot.append(el('span', { class: 'task-count', text: `${count} comment${count === 1 ? '' : 's'}` }));
  }

  const at = COLUMNS.findIndex((c) => c.key === task.status);
  const next = COLUMNS[at + 1];
  if (next) {
    const move = el('button', {
      class: 'task-next',
      type: 'button',
      title: `Move to ${next.label}`,
      'aria-label': `Move "${task.title}" to ${next.label}`,
      text: `${next.label} →`,
    });
    move.addEventListener('click', () => moveTo(task, next.key));
    foot.append(move);
  }
  return foot;
}

function allProjects() {
  const set = new Set(PROJECTS);
  for (const name of ctx.state.projects.keys()) set.add(name);
  for (const t of tasks.values()) if (t.project) set.add(t.project);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function matches(task) {
  const person = ctx.state.person;
  if (person !== 'all' && task.assignee !== person && task.assignee !== 'Both') return false;
  if (project !== 'all' && (task.project || '') !== project) return false;
  return true;
}

export function render() {
  renderPending = false;
  const visible = [...tasks.values()].sort((a, b) => a.position - b.position).filter(matches);

  for (const col of COLUMNS) {
    const { list, count } = columnEls[col.key];
    const items = visible.filter((t) => t.status === col.key);
    list.replaceChildren(el('li', { class: 'empty', text: 'Nothing here' }), ...items.map(taskCard));
    count.textContent = String(items.length);
  }

  const projects = allProjects();
  if (project !== 'all' && !projects.includes(project)) project = 'all';
  const select = $('#filter-project');
  select.replaceChildren(
    el('option', { value: 'all', text: 'All projects' }),
    ...projects.map((p) => el('option', { value: p, text: p })),
  );
  select.value = project;
  $('#project-options').replaceChildren(...projects.map((p) => el('option', { value: p })));
}

function scheduleRender() {
  if (dragging || dialog.open) renderPending = true;
  else render();
}

function taskCard(task) {
  const top = el('div', { class: 'task-top' });
  if (task.project) {
    const tag = el('span', { class: 'tag', text: task.project });
    tag.style.color = projectColor(task.project, ctx.state.projects);
    top.append(tag);
  }
  if (task.assignee) {
    top.append(
      el('span', {
        class: `avatar avatar-${task.assignee.toLowerCase()}`,
        title: task.assignee,
        'aria-label': `Assigned to ${task.assignee}`,
        text: task.assignee === 'Both' ? '2' : task.assignee.slice(0, 1).toUpperCase(),
      }),
    );
  }

  const open = el('button', { class: 'task-open', type: 'button' }, [
    top.childNodes.length ? top : null,
    el('h3', { text: task.title }),
    task.notes ? el('p', { class: 'task-notes', text: task.notes }) : null,
  ]);
  open.addEventListener('click', () => (ctx.state.threadsReady ? ctx.openTask(task.id) : openDialog(task)));

  const li = el('li', { class: 'task', draggable: 'true', 'data-id': task.id }, [open, taskFooter(task)]);
  const color = taskColor(task, ctx.state.projects);
  if (color) li.style.setProperty('--task-color', color);

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
  const task = tasks.get(id);
  if (!task) return;

  const neighbor = (n, dir) => {
    let sib = n[dir];
    while (sib && !sib.classList.contains('task')) sib = sib[dir];
    return sib ? tasks.get(sib.dataset.id) : null;
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
  if (samePlace) return;

  const before = { ...task };
  Object.assign(task, { status, position });
  try {
    const row = await ctx.api.updateTask(id, { status, position });
    tasks.set(row.id, row);
  } catch (err) {
    tasks.set(id, before);
    toast(friendly(err));
  }
  scheduleRender();
}

// ---------- Task dialog ----------

function renderColorPicker(value) {
  editingColor = value || null;
  const wrap = $('#task-color');
  wrap.closest('.field').hidden = !ctx.state.schemaReady;
  wrap.replaceChildren(
    swatchPicker({
      value: editingColor,
      noneLabel: 'Project',
      label: 'Task color',
      onChange: (hex) => {
        editingColor = hex;
      },
    }),
  );
}

export function openDialog(task, status = 'todo') {
  const person = ctx.state.person;
  editingId = task?.id ?? null;
  $('#task-dialog-title').textContent = task ? 'Edit task' : 'New task';
  $('#task-delete').hidden = !task;
  $('#task-error').textContent = '';
  form.title.value = task?.title ?? '';
  form.notes.value = task?.notes ?? '';
  form.status.value = task?.status ?? status;
  form.assignee.value = task?.assignee ?? (person !== 'all' ? person : '');
  form.project.value = task?.project ?? (project !== 'all' ? project : '');
  renderColorPicker(task?.color);
  dialog.showModal();
  form.title.focus();
}

function closeDialog() {
  dialog.close();
}

async function onSubmit(e) {
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
  if (ctx.state.schemaReady) values.color = editingColor;

  const save = $('#task-save');
  save.disabled = true;
  try {
    const existing = editingId ? tasks.get(editingId) : null;
    let row;
    if (existing) {
      const patch = { ...values };
      if (existing.status !== values.status) patch.position = Date.now(); // moved column: put it at the bottom
      row = await ctx.api.updateTask(editingId, patch);
    } else {
      row = await ctx.api.insertTask({ ...values, position: Date.now() });
    }
    tasks.set(row.id, row);
    closeDialog();
    ctx.changed();
  } catch (err) {
    $('#task-error').textContent = friendly(err);
  } finally {
    save.disabled = false;
  }
}

async function onDelete() {
  const id = editingId;
  const task = id && tasks.get(id);
  if (!task) return;
  const yes = await confirmModal('Delete task', `Delete "${task.title}" and its discussion?`);
  if (!yes) return;
  try {
    await ctx.api.removeTask(id);
    tasks.delete(id);
    closeDialog();
    ctx.changed();
  } catch (err) {
    $('#task-error').textContent = friendly(err);
  }
}

// ---------- Project colors ----------

function openProjectColors() {
  if (!ctx.state.schemaReady) {
    toast('Run supabase/002_vault_colors.sql first.', 6000);
    return;
  }

  const list = el('div', { class: 'project-colors' });
  const addRow = (name) => {
    const dot = el('span', { class: 'project-dot' });
    const paint = (hex) => dot.style.setProperty('--swatch', hex);
    const current = projectColor(name, ctx.state.projects);
    paint(current);
    list.append(
      el('div', { class: 'project-row' }, [
        el('span', { class: 'project-name' }, [dot, name]),
        swatchPicker({
          value: current,
          label: `Color for ${name}`,
          onChange: async (hex) => {
            paint(hex);
            try {
              await ctx.api.setProjectColor(name, hex);
              ctx.state.projects.set(name, hex);
              render();
            } catch (err) {
              toast(friendly(err));
            }
          },
        }),
      ]),
    );
  };
  allProjects().forEach(addRow);

  const input = el('input', { type: 'text', maxlength: '60', placeholder: 'New project name', 'aria-label': 'New project name' });
  const addBtn = el('button', { class: 'btn', type: 'button', text: 'Add' });
  const add = () => {
    const name = input.value.trim();
    if (!name || allProjects().includes(name)) return;
    const color = projectColor(name, ctx.state.projects);
    ctx.api
      .setProjectColor(name, color)
      .then(() => {
        ctx.state.projects.set(name, color);
        addRow(name);
        input.value = '';
        render();
      })
      .catch((err) => toast(friendly(err)));
  };
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add();
  });

  modal({
    title: 'Project colors',
    body: [
      el('p', { class: 'muted small', text: 'Cards use their project color unless the task has its own color.' }),
      list,
      el('div', { class: 'project-add' }, [input, addBtn]),
    ],
    buttons: [{ label: 'Done', primary: true }],
    wide: true,
  });
}
