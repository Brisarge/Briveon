// AI bundle: pick tasks and notes, choose a template, copy a ready-made prompt.
// Paste the result into Claude. Nothing here calls an AI service.

import { $, el, store, toast, friendly } from '../lib/ui.js';
import { createPicker } from '../lib/thread.js';
import { buildPrompt, estimateTokens, STARTER_TEMPLATES, PROMPTS_FOLDER, RULES_PATH } from '../lib/prompt.js';

const LARGE_PROMPT = 150000;

let ctx;
let parts = null;
let tasksPicker = null;
let notesPicker = null;

const dialog = el('dialog', { class: 'drawer workbench', 'aria-labelledby': 'workbench-title' });
const openButton = $('#open-workbench');
const countBadge = $('#bundle-count');

function readJson(key, fallback) {
  try {
    return JSON.parse(store.get(key, '')) ?? fallback;
  } catch {
    return fallback;
  }
}

const bundle = readJson('bundle', { tasks: [], notes: [] });
const options = {
  template: store.get('bundleTemplate', STARTER_TEMPLATES[0].name),
  linked: store.get('bundleLinked', '1') === '1',
  discussion: store.get('bundleDiscussion', '0') === '1',
};
let request = store.get('bundleRequest', '');

const noteName = (path) => path.split('/').pop().replace(/\.md$/i, '');
const isPromptNote = (note) => note.path.toLowerCase().startsWith(PROMPTS_FOLDER.toLowerCase());
const saveBundle = () => store.set('bundle', JSON.stringify(bundle));

// ---------- Selection ----------

const selectedTasks = () => bundle.tasks.map((id) => ctx.getTask(id)).filter(Boolean);
const selectedNotes = () => bundle.notes.map((id) => ctx.getNote(id)).filter(Boolean);

function linkedNotesOf(taskId) {
  return ctx.data.links
    .filter((l) => l.task_id === taskId)
    .map((l) => ctx.getNote(l.note_id))
    .filter(Boolean);
}

// Notes that come along with the selected tasks, minus any picked by hand.
function autoNotes() {
  if (!options.linked) return [];
  const picked = new Set(bundle.notes);
  const seen = new Map();
  for (const task of selectedTasks()) {
    for (const note of linkedNotesOf(task.id)) if (!picked.has(note.id)) seen.set(note.id, note);
  }
  return [...seen.values()];
}

function renderCount() {
  const count = selectedTasks().length + selectedNotes().length;
  countBadge.hidden = count === 0;
  countBadge.textContent = String(count);
  openButton.setAttribute('aria-label', count ? `AI bundle, ${count} selected` : 'AI bundle');
}

export function addTask(id) {
  if (!bundle.tasks.includes(id)) bundle.tasks.push(id);
  saveBundle();
  renderCount();
  toast('Added to the AI bundle.');
}

export function addNote(id) {
  if (!bundle.notes.includes(id)) bundle.notes.push(id);
  saveBundle();
  renderCount();
  toast('Added to the AI bundle.');
}

// ---------- Templates ----------

function templates() {
  const custom = ctx
    .listNotes()
    .filter((n) => isPromptNote(n) && n.path.toLowerCase() !== RULES_PATH.toLowerCase())
    .map((n) => ({ name: noteName(n.path), body: n.content, note: n }));
  const taken = new Set(custom.map((t) => t.name.toLowerCase()));
  const starters = STARTER_TEMPLATES.filter((t) => !taken.has(t.name.toLowerCase()));
  return [...starters, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}

function currentTemplate() {
  const all = templates();
  return all.find((t) => t.name === options.template) || all[0];
}

const rulesNote = () => ctx.listNotes().find((n) => n.path.toLowerCase() === RULES_PATH.toLowerCase());

async function openOrCreateNote(path, content) {
  let note = ctx.listNotes().find((n) => n.path.toLowerCase() === path.toLowerCase());
  try {
    if (!note) note = await ctx.createNote(path, content);
    close();
    ctx.openNote(note.id);
  } catch (err) {
    toast(friendly(err), 6000);
  }
}

// ---------- Prompt ----------

function currentPrompt() {
  const tasks = selectedTasks().map((task) => ({
    task,
    linkedPaths: linkedNotesOf(task.id).map((n) => n.path),
    comments: options.discussion
      ? [...ctx.data.comments.values()]
          .filter((c) => c.task_id === task.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [],
    nameOf: ctx.nameOf,
  }));
  return buildPrompt({
    template: currentTemplate().body,
    request,
    tasks,
    notes: [...selectedNotes(), ...autoNotes()],
    rules: rulesNote()?.content,
  });
}

function renderPrompt() {
  if (!parts) return;
  const text = currentPrompt();
  parts.preview.value = text;
  const tokens = estimateTokens(text);
  parts.size.textContent = `About ${tokens.toLocaleString()} tokens`;
  parts.size.classList.toggle('too-big', tokens > LARGE_PROMPT);
  parts.size.title = tokens > LARGE_PROMPT ? 'This may be too large to paste into one message.' : 'A rough estimate';
}

async function copyPrompt() {
  const text = parts.preview.value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    parts.preview.focus();
    parts.preview.select();
    if (!document.execCommand('copy')) {
      toast('Copy was blocked. The prompt is selected, so press Ctrl+C.', 6000);
      return;
    }
  }
  parts.copy.textContent = 'Copied';
  setTimeout(() => {
    if (parts) parts.copy.textContent = 'Copy prompt';
  }, 1800);
}

function downloadPrompt() {
  const url = URL.createObjectURL(new Blob([parts.preview.value], { type: 'text/markdown;charset=utf-8' }));
  const link = el('a', { href: url, download: 'briveon-prompt.md' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Panel ----------

function selectedRow(label, sub, onRemove) {
  const remove = el('button', { class: 'unlink', type: 'button', text: 'Remove', 'aria-label': `Remove ${label}` });
  remove.addEventListener('click', onRemove);
  return el('div', { class: 'bundle-row' }, [
    el('div', { class: 'bundle-label' }, [el('b', { text: label }), sub ? el('small', { text: sub }) : null]),
    remove,
  ]);
}

function renderLists() {
  if (!parts) return;

  const tasks = selectedTasks();
  parts.tasks.replaceChildren(
    ...(tasks.length
      ? tasks.map((t) =>
          selectedRow(t.title, t.project || '', () => {
            bundle.tasks = bundle.tasks.filter((id) => id !== t.id);
            afterChange();
          }),
        )
      : [el('p', { class: 'thread-empty', text: 'No tasks selected.' })]),
  );

  const notes = selectedNotes();
  const auto = autoNotes();
  parts.notes.replaceChildren(
    ...notes.map((n) =>
      selectedRow(noteName(n.path), n.path, () => {
        bundle.notes = bundle.notes.filter((id) => id !== n.id);
        afterChange();
      }),
    ),
    ...auto.map((n) =>
      el('div', { class: 'bundle-row bundle-auto' }, [
        el('div', { class: 'bundle-label' }, [el('b', { text: noteName(n.path) }), el('small', { text: n.path })]),
        el('span', { class: 'bundle-tag', text: 'Linked to a task' }),
      ]),
    ),
    ...(notes.length || auto.length ? [] : [el('p', { class: 'thread-empty', text: 'No notes selected.' })]),
  );

  const rules = rulesNote();
  parts.rules.textContent = rules ? 'Edit project rules' : 'Add project rules';
  parts.rulesState.textContent = rules
    ? `Included from ${RULES_PATH}`
    : 'Optional: rules that go into every prompt, like your Luau style and "never reset player data".';

  const select = parts.template;
  const list = templates();
  select.replaceChildren(...list.map((t) => el('option', { value: t.name, text: t.name })));
  select.value = currentTemplate().name;
  parts.editTemplate.textContent = currentTemplate().note ? 'Edit template' : 'Customize template';

  tasksPicker?.refresh();
  notesPicker?.refresh();
  renderPrompt();
}

function afterChange() {
  saveBundle();
  renderCount();
  renderLists();
}

function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', autocomplete: 'off' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'bundle-check' }, [input, label]);
}

function togglePicker(which) {
  const isTasks = which === 'tasks';
  const slot = isTasks ? parts.tasksSlot : parts.notesSlot;
  if (isTasks ? tasksPicker : notesPicker) {
    slot.replaceChildren();
    if (isTasks) tasksPicker = null;
    else notesPicker = null;
    return;
  }

  const picker = isTasks
    ? createPicker({
        placeholder: 'Search tasks',
        items: () =>
          ctx
            .listTasks()
            .filter((t) => !bundle.tasks.includes(t.id))
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((t) => ({ id: t.id, label: t.title, sub: t.project || '' })),
        onPick: (item) => {
          bundle.tasks.push(item.id);
          afterChange();
        },
      })
    : createPicker({
        placeholder: 'Search notes',
        items: () =>
          ctx
            .listNotes()
            .filter((n) => !bundle.notes.includes(n.id) && !isPromptNote(n))
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((n) => ({ id: n.id, label: noteName(n.path), sub: n.path })),
        onPick: (item) => {
          bundle.notes.push(item.id);
          afterChange();
        },
      });

  if (isTasks) tasksPicker = picker;
  else notesPicker = picker;
  slot.replaceChildren(picker.el);
  picker.focus();
}

function buildPanel() {
  const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', text: '✕' });
  closeBtn.addEventListener('click', close);

  parts = {
    template: el('select', { 'aria-label': 'Prompt template' }),
    editTemplate: el('button', { class: 'btn btn-small', type: 'button' }),
    request: el('textarea', {
      rows: '3',
      maxlength: '20000',
      placeholder: 'What do you want Claude to do?',
      'aria-label': 'Your request',
    }),
    tasks: el('div', { class: 'bundle-list' }),
    notes: el('div', { class: 'bundle-list' }),
    tasksSlot: el('div', {}),
    notesSlot: el('div', {}),
    rules: el('button', { class: 'btn btn-small', type: 'button' }),
    rulesState: el('p', { class: 'bundle-rules' }),
    preview: el('textarea', { class: 'bundle-preview', readonly: true, rows: '12', 'aria-label': 'Generated prompt' }),
    size: el('span', { class: 'bundle-size' }),
    copy: el('button', { class: 'btn btn-primary', type: 'button', text: 'Copy prompt' }),
    download: el('button', { class: 'btn', type: 'button', text: 'Download .md' }),
    clear: el('button', { class: 'btn btn-small', type: 'button', text: 'Clear selection' }),
  };

  parts.request.value = request;
  parts.request.addEventListener('input', () => {
    request = parts.request.value;
    store.set('bundleRequest', request);
    renderPrompt();
  });
  parts.template.addEventListener('change', () => {
    options.template = parts.template.value;
    store.set('bundleTemplate', options.template);
    renderLists();
  });
  parts.editTemplate.addEventListener('click', () => {
    const t = currentTemplate();
    if (t.note) {
      close();
      ctx.openNote(t.note.id);
    } else {
      openOrCreateNote(`${PROMPTS_FOLDER}${t.name}.md`, t.body);
    }
  });
  parts.rules.addEventListener('click', () =>
    openOrCreateNote(RULES_PATH, '# Project Rules\n\nThis note goes into every AI prompt. Keep it short.\n\n- \n'),
  );
  parts.copy.addEventListener('click', copyPrompt);
  parts.download.addEventListener('click', downloadPrompt);
  parts.clear.addEventListener('click', () => {
    bundle.tasks = [];
    bundle.notes = [];
    afterChange();
  });

  const addTasks = el('button', { class: 'btn btn-small', type: 'button', text: '+ Add task' });
  addTasks.addEventListener('click', () => togglePicker('tasks'));
  const addNotes = el('button', { class: 'btn btn-small', type: 'button', text: '+ Add note' });
  addNotes.addEventListener('click', () => togglePicker('notes'));

  dialog.replaceChildren(
    el('header', { class: 'drawer-head' }, [
      el('div', { class: 'drawer-heading' }, [
        el('h2', { id: 'workbench-title', text: 'AI bundle' }),
        el('p', { class: 'drawer-who', text: 'Builds a prompt to paste into Claude. Nothing is sent anywhere.' }),
      ]),
      closeBtn,
    ]),
    el('div', { class: 'drawer-scroll' }, [
      el('section', { class: 'bundle-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Template' }), parts.editTemplate]),
        parts.template,
      ]),
      el('section', { class: 'bundle-section' }, [el('h3', { text: 'Your request' }), parts.request]),
      el('section', { class: 'bundle-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Tasks' }), addTasks]),
        parts.tasksSlot,
        parts.tasks,
        el('div', { class: 'bundle-options' }, [
          checkbox('Include linked notes', options.linked, (on) => {
            options.linked = on;
            store.set('bundleLinked', on ? '1' : '0');
            renderLists();
          }),
          checkbox('Include task discussions', options.discussion, (on) => {
            options.discussion = on;
            store.set('bundleDiscussion', on ? '1' : '0');
            renderPrompt();
          }),
        ]),
      ]),
      el('section', { class: 'bundle-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Notes' }), addNotes]),
        parts.notesSlot,
        parts.notes,
      ]),
      el('section', { class: 'bundle-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Project rules' }), parts.rules]),
        parts.rulesState,
      ]),
      el('section', { class: 'bundle-section' }, [
        el('div', { class: 'drawer-section-head' }, [el('h3', { text: 'Prompt' }), parts.clear]),
        parts.preview,
      ]),
    ]),
    el('footer', { class: 'bundle-foot' }, [parts.size, parts.download, parts.copy]),
  );
}

export function open() {
  if (!parts) buildPanel();
  renderLists();
  if (!dialog.open) dialog.showModal();
}

export function close() {
  if (dialog.open) dialog.close();
}

// Tasks or notes changed somewhere else.
export function refresh() {
  renderCount();
  if (dialog.open) renderLists();
}

export function init(context) {
  ctx = context;
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    tasksPicker = null;
    notesPicker = null;
    parts?.tasksSlot.replaceChildren();
    parts?.notesSlot.replaceChildren();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  openButton.addEventListener('click', open);
}
