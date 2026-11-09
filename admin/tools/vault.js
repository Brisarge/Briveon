// The vault: folder tree, Markdown editor with preview, [[wikilinks]], backlinks,
// search, Obsidian import, version history and edit-conflict protection.

import { $, el, store, toast, friendly, modal, confirmModal, timeAgo } from '../lib/ui.js';
import { loadMarkdown, renderInto, handleLinkClick } from '../lib/markdown.js';
import { createThread, createPicker } from '../lib/thread.js';

const MAX_NOTE = 1000000;

let ctx;
const notes = new Map();
let currentId = null;
let baseVersion = 0;
let dirty = false;
let query = '';
let mode = store.get('noteMode', 'split');
let collapsed = new Set(readCollapsed());
let previewTimer = 0;
let thread = null;
let threadOpen = store.get('noteThread', '0') === '1';

const tree = $('#note-tree');
const editor = $('#note-editor');
const preview = $('#note-preview');
const banner = $('#note-banner');
const saveBtn = $('#note-save');

function readCollapsed() {
  try {
    return JSON.parse(store.get('collapsed', '[]'));
  } catch {
    return [];
  }
}

// ---------- Paths and links ----------

export function normalizePath(input) {
  let path = input.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
  path = path.split('/').map((s) => s.trim()).join('/');
  if (path && !/\.md$/i.test(path)) path += '.md';
  return path;
}

export function pathProblem(path) {
  if (path.length < 4) return 'Give the note a name.';
  if (path.length > 300) return 'That path is too long.';
  if (/[<>:"|?*\u0000-\u001f]/.test(path)) return 'Names can\'t contain < > : " | ? *';
  if (/(^|\/)[. ]/.test(path) || /[. ]\//.test(path)) return "Folder and note names can't start with a dot, or end with a dot or space.";
  return null;
}

const baseName = (path) => path.split('/').pop().replace(/\.md$/i, '');
const noteHash = (path) => `#vault/${path.split('/').map(encodeURIComponent).join('/')}`;

function findByPath(path) {
  const lower = path.toLowerCase();
  for (const n of notes.values()) if (n.path.toLowerCase() === lower) return n;
  return null;
}

// Same rules as Obsidian: full path, or just the note's name anywhere in the vault.
export function resolveLink(target) {
  const clean = target.split('#')[0].trim().replace(/\.md$/i, '').toLowerCase();
  if (!clean) return null;
  const sorted = [...notes.values()].sort((a, b) => a.path.length - b.path.length);
  return (
    sorted.find((n) => n.path.replace(/\.md$/i, '').toLowerCase() === clean) ||
    sorted.find((n) => baseName(n.path).toLowerCase() === clean) ||
    null
  );
}

function linksIn(content) {
  return [...content.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)].map((m) => m[1]);
}

// ---------- Markdown ----------

function updatePreview() {
  renderInto(preview, editor.value, resolveLink);
}

// ---------- Tree ----------

function matchesPerson(note) {
  const person = ctx.state.person;
  if (person === 'all') return true;
  return ctx.nameOf(note.updated_by) === person || ctx.nameOf(note.created_by) === person;
}

function visibleNotes() {
  return [...notes.values()].filter(matchesPerson).sort((a, b) => a.path.localeCompare(b.path));
}

function buildTree(list) {
  const root = { folders: new Map(), files: [] };
  for (const note of list) {
    const parts = note.path.split('/');
    const name = parts.pop();
    let node = root;
    let sofar = '';
    for (const part of parts) {
      sofar += `${part}/`;
      if (!node.folders.has(part)) node.folders.set(part, { path: sofar, folders: new Map(), files: [] });
      node = node.folders.get(part);
    }
    node.files.push({ note, name });
  }
  return root;
}

function fileButton(note, label, sub) {
  const btn = el(
    'button',
    {
      class: `tree-file${note.id === currentId ? ' current' : ''}`,
      type: 'button',
      title: note.path,
      'aria-current': note.id === currentId ? 'true' : null,
    },
    [el('span', { class: 'tree-label', text: label }), sub ? el('span', { class: 'tree-sub', text: sub }) : null],
  );
  if (note.id === currentId && dirty) btn.append(el('span', { class: 'dirty-dot', title: 'Unsaved changes' }));
  btn.addEventListener('click', () => open(note.id));
  return btn;
}

function renderBranch(node) {
  const ul = el('ul', { class: 'tree-list' });
  const folders = [...node.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [name, folder] of folders) {
    const isClosed = collapsed.has(folder.path);
    const toggle = el('button', { class: 'tree-folder', type: 'button', 'aria-expanded': String(!isClosed) }, [
      el('span', { class: 'tree-caret', text: isClosed ? '▸' : '▾' }),
      el('span', { class: 'tree-label', text: name }),
    ]);
    toggle.addEventListener('click', () => {
      if (collapsed.has(folder.path)) collapsed.delete(folder.path);
      else collapsed.add(folder.path);
      store.set('collapsed', JSON.stringify([...collapsed]));
      renderTree();
    });
    const addHere = el('button', {
      class: 'tree-add',
      type: 'button',
      title: `New note in ${folder.path}`,
      'aria-label': `New note in ${folder.path}`,
      text: '+',
    });
    addHere.addEventListener('click', () => newNote(folder.path));

    ul.append(
      el('li', {}, [el('div', { class: 'tree-row' }, [toggle, addHere]), isClosed ? null : renderBranch(folder)]),
    );
  }

  node.files
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(({ note, name }) => ul.append(el('li', {}, fileButton(note, name.replace(/\.md$/i, '')))));
  return ul;
}

function snippet(content, q) {
  const at = content.toLowerCase().indexOf(q);
  if (at < 0) return '';
  return content.slice(Math.max(0, at - 24), at + q.length + 40).replace(/\s+/g, ' ').trim();
}

function searchResults() {
  const q = query.toLowerCase();
  return visibleNotes()
    .filter((n) => n.path.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .sort((a, b) => Number(b.path.toLowerCase().includes(q)) - Number(a.path.toLowerCase().includes(q)));
}

function renderTree() {
  if (query) {
    const hits = searchResults();
    tree.replaceChildren(
      hits.length
        ? el(
            'ul',
            { class: 'tree-list' },
            hits.map((n) => el('li', {}, fileButton(n, baseName(n.path), n.path.toLowerCase().includes(query.toLowerCase()) ? n.path : snippet(n.content, query.toLowerCase())))),
          )
        : el('p', { class: 'tree-empty', text: 'No notes match.' }),
    );
    return;
  }

  const list = visibleNotes();
  tree.replaceChildren(
    list.length
      ? renderBranch(buildTree(list))
      : el('p', { class: 'tree-empty', text: notes.size ? 'No notes for this person.' : 'No notes yet.' }),
  );
}

export function render() {
  renderTree();
  if (currentId) renderMeta();
}

// ---------- Open note ----------

function renderMeta() {
  const note = notes.get(currentId);
  if (!note) return;
  $('#note-title').textContent = baseName(note.path);
  $('#note-meta').textContent = `${note.path} · edited by ${ctx.nameOf(note.updated_by)} ${timeAgo(note.updated_at)}`;
  saveBtn.disabled = !dirty;
  saveBtn.textContent = dirty ? 'Save' : 'Saved';
}

function renderBacklinks() {
  const box = $('#note-backlinks');
  const hits = [...notes.values()].filter(
    (n) => n.id !== currentId && linksIn(n.content).some((t) => resolveLink(t)?.id === currentId),
  );
  const nodes = [];
  if (hits.length) {
    nodes.push(
      el('h2', { text: 'Linked from' }),
      ...hits.map((n) => {
        const b = el('button', { class: 'backlink', type: 'button', text: baseName(n.path), title: n.path });
        b.addEventListener('click', () => open(n.id));
        return b;
      }),
    );
  }

  if (ctx.state.threadsReady) {
    const tasks = ctx.data.links
      .filter((l) => l.note_id === currentId)
      .map((l) => ctx.getTask(l.task_id))
      .filter(Boolean);
    nodes.push(
      el('h2', { text: 'Tasks' }),
      ...tasks.map((t) => {
        const b = el('button', { class: 'backlink backlink-task', type: 'button', text: t.title, title: `Open task: ${t.title}` });
        b.addEventListener('click', () => ctx.openTask(t.id));
        return b;
      }),
    );
    const add = el('button', { class: 'backlink backlink-add', type: 'button', text: '+ Link task' });
    add.addEventListener('click', linkTask);
    nodes.push(add);
  }
  box.replaceChildren(...nodes);
}

function linkTask() {
  const noteId = currentId;
  let finish = null;
  const picker = createPicker({
    placeholder: 'Search tasks to link',
    items: () => {
      const linked = new Set(ctx.data.links.filter((l) => l.note_id === noteId).map((l) => l.task_id));
      return ctx
        .listTasks()
        .filter((t) => !linked.has(t.id))
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((t) => ({ id: t.id, label: t.title, sub: t.project || '' }));
    },
    onPick: async (item) => {
      try {
        const row = await ctx.api.linkNote(item.id, noteId);
        ctx.data.addLink(row);
        finish?.(null);
        ctx.changed();
      } catch (err) {
        toast(friendly(err), 6000);
      }
    },
  });
  modal({
    title: 'Link a task',
    body: picker.el,
    buttons: [{ label: 'Cancel' }],
    onOpen(_dialog, close) {
      finish = close;
      picker.focus();
    },
  });
}

function renderDiscussButton() {
  const count = [...ctx.data.comments.values()].filter((c) => c.note_id === currentId).length;
  const button = $('#note-discuss');
  button.textContent = count ? `Discussion (${count})` : 'Discussion';
  button.setAttribute('aria-expanded', String(threadOpen));
}

function showThread() {
  const box = $('#note-thread');
  box.hidden = !(threadOpen && currentId && ctx.state.threadsReady);
  $('#note-discuss').hidden = !ctx.state.threadsReady;
  if (!box.hidden && !thread) {
    thread = createThread(ctx, { note_id: currentId });
    box.replaceChildren(el('h2', { text: 'Discussion' }), thread.el);
  }
  renderDiscussButton();
}

// Links or comments changed somewhere else.
export function refreshLinked() {
  if (!currentId) return;
  renderBacklinks();
  thread?.refresh();
  showThread();
}

function applyMode() {
  $('#note-body').className = `note-body mode-${mode}`;
  document.querySelectorAll('#note-modes .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mode === mode)));
}

function setDirty(value) {
  if (dirty === value) return;
  dirty = value;
  renderMeta();
  renderTree();
}

function showBanner(message, action) {
  banner.replaceChildren(el('span', { text: message }));
  if (action) {
    const b = el('button', { class: 'btn btn-small', type: 'button', text: action.label });
    b.addEventListener('click', action.run);
    banner.append(b);
  }
  banner.hidden = false;
}

function loadIntoEditor(note) {
  editor.value = note.content;
  baseVersion = note.version;
  dirty = false;
  banner.hidden = true;
  updatePreview();
  renderMeta();
  renderBacklinks();
  renderTree();
}

async function confirmDiscard() {
  if (!dirty) return true;
  return (
    (await modal({
      title: 'Unsaved changes',
      body: el('p', { class: 'muted', text: 'This note has changes you haven\'t saved. Discard them?' }),
      buttons: [
        { label: 'Keep editing', value: false },
        { label: 'Discard', value: true, danger: true },
      ],
    })) === true
  );
}

async function open(id) {
  if (id === currentId) return;
  if (!(await confirmDiscard())) return;
  const note = notes.get(id);
  if (!note) return;

  currentId = id;
  $('#vault-empty').hidden = true;
  $('#note-pane').hidden = false;
  $('#tool-vault').classList.add('note-open');
  applyMode();
  thread = null;
  $('#note-thread').replaceChildren();
  loadIntoEditor(note);
  showThread();
  history.replaceState(null, '', `${location.pathname}${location.search}${noteHash(note.path)}`);
}

export function openPath(path) {
  const note = findByPath(path);
  if (note) open(note.id);
}

export function openId(id) {
  $('#tool-vault').classList.add('note-open');
  open(id);
}

// Used by the AI bundle to save a template or rules note.
export async function createNote(path, content) {
  const [row] = await ctx.api.insertNotes([{ path, content }]);
  notes.set(row.id, row);
  renderTree();
  return row;
}

export const get = (id) => notes.get(id);
export const list = () => [...notes.values()];

function closeNote() {
  currentId = null;
  dirty = false;
  thread = null;
  $('#note-thread').replaceChildren();
  $('#note-thread').hidden = true;
  $('#note-pane').hidden = true;
  $('#vault-empty').hidden = false;
  $('#tool-vault').classList.remove('note-open');
  if (location.hash.startsWith('#vault')) {
    history.replaceState(null, '', `${location.pathname}${location.search}#vault`);
  }
  renderTree();
}

export const isDirty = () => dirty;
export function discard() {
  dirty = false;
}
export function focusSearch() {
  $('#tool-vault').classList.remove('note-open');
  const input = $('#note-search');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

// ---------- Save, conflicts ----------

async function save() {
  const note = notes.get(currentId);
  if (!note || !dirty) return;
  if (editor.value.length > MAX_NOTE) {
    toast('This note is over the 1,000,000 character limit.', 6000);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const row = await ctx.api.saveNote(currentId, { content: editor.value }, baseVersion);
    if (row) {
      notes.set(row.id, row);
      baseVersion = row.version;
      dirty = false;
      banner.hidden = true;
      renderMeta();
      renderTree();
      renderBacklinks();
      return;
    }
    await handleSaveRefused();
  } catch (err) {
    toast(friendly(err), 6000);
  }
  renderMeta();
}

async function handleSaveRefused() {
  const latest = await ctx.api.getNote(currentId);
  if (!latest) {
    toast('This note was deleted. Copy your text somewhere safe before leaving.', 8000);
    return;
  }
  if (latest.version === baseVersion) {
    toast(friendly({ code: '42501' }), 8000);
    return;
  }

  notes.set(latest.id, latest);
  const choice = await modal({
    title: 'Someone saved first',
    body: el('p', {
      class: 'muted',
      text: `${ctx.nameOf(latest.updated_by)} saved this note while you were editing. If you save yours, their version stays in History.`,
    }),
    buttons: [
      { label: 'Keep editing', value: 'keep' },
      { label: 'Load theirs', value: 'theirs', danger: true },
      { label: 'Save mine', value: 'mine', primary: true },
    ],
  });

  if (choice === 'theirs') loadIntoEditor(latest);
  else if (choice === 'mine') {
    baseVersion = latest.version;
    await save();
  }
}

// ---------- Live updates ----------

function applyServerNote(row) {
  notes.set(row.id, row);
  if (row.id !== currentId || row.version <= baseVersion) return;
  if (!dirty) {
    loadIntoEditor(row);
  } else if (row.updated_by !== ctx.user?.id) {
    showBanner(`${ctx.nameOf(row.updated_by)} just saved a newer version of this note.`, {
      label: 'Load theirs',
      run: async () => {
        const yes = await confirmModal('Load their version?', 'Your unsaved changes will be lost.', 'Load theirs');
        if (yes) loadIntoEditor(notes.get(currentId));
      },
    });
  }
}

export async function onRemote(payload) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old.id;
    notes.delete(id);
    if (id === currentId) {
      if (dirty) showBanner('This note was deleted by someone else. Copy your text before leaving.');
      else closeNote();
    }
    renderTree();
    return;
  }
  try {
    // Fetched fresh, since live messages can leave out very large notes.
    const row = await ctx.api.getNote(payload.new.id);
    if (!row) return;
    applyServerNote(row);
    render();
    if (row.id !== currentId) renderBacklinks();
  } catch {
    /* the next focus reload picks it up */
  }
}

export async function load() {
  if (!ctx.state.schemaReady) {
    tree.replaceChildren(el('p', { class: 'tree-empty', text: 'Needs the database update (see the banner above).' }));
    return;
  }
  try {
    const rows = await ctx.api.listNotes();
    const seen = new Set(rows.map((r) => r.id));
    for (const id of [...notes.keys()]) if (!seen.has(id)) notes.delete(id);
    rows.forEach(applyServerNote);
    if (currentId && !notes.has(currentId) && !dirty) closeNote();
    render();
  } catch (err) {
    toast(friendly(err), 8000);
  }
}

export function clear() {
  notes.clear();
  if (currentId) closeNote();
}

// ---------- New, rename, delete ----------

function pathForm({ title, value, confirmLabel, onSubmit }) {
  const input = el('input', { type: 'text', value, maxlength: '300', autocomplete: 'off', 'aria-label': 'Note path' });
  const error = el('p', { class: 'form-error', role: 'alert' });
  const body = [
    el('label', { class: 'field' }, [el('span', { text: 'Path (use / for folders)' }), input]),
    el('p', { class: 'muted small', text: 'Example: Specs/Combat/Abilities' }),
    error,
  ];

  return modal({
    title,
    body,
    buttons: [{ label: 'Cancel' }, { label: confirmLabel, primary: true, value: '__go', submit: false }],
    onOpen(dialog, close) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      const go = async () => {
        const path = normalizePath(input.value);
        const problem = pathProblem(path);
        if (problem) {
          error.textContent = problem;
          return;
        }
        try {
          await onSubmit(path);
          close(path);
        } catch (err) {
          error.textContent = friendly(err);
        }
      };
      const primary = dialog.querySelector('footer .btn-primary');
      primary.replaceWith(primary.cloneNode(true));
      dialog.querySelector('footer .btn-primary').addEventListener('click', go);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      });
    },
  });
}

async function newNote(prefix = '') {
  if (!ctx.state.schemaReady) {
    toast('Run supabase/002_vault_colors.sql first.', 6000);
    return;
  }
  if (!(await confirmDiscard())) return;
  dirty = false;

  let created = null;
  await pathForm({
    title: 'New note',
    value: prefix,
    confirmLabel: 'Create',
    onSubmit: async (path) => {
      const [row] = await ctx.api.insertNotes([{ path, content: `# ${baseName(path)}\n\n` }]);
      notes.set(row.id, row);
      created = row;
    },
  });
  if (created) {
    for (const key of [...collapsed]) if (created.path.startsWith(key)) collapsed.delete(key);
    currentId = null;
    await open(created.id);
    renderTree();
    if (mode !== 'preview') {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }
}

async function renameNote() {
  const note = notes.get(currentId);
  if (!note) return;
  if (dirty) {
    toast('Save your changes before renaming.');
    return;
  }
  await pathForm({
    title: 'Rename or move',
    value: note.path.replace(/\.md$/i, ''),
    confirmLabel: 'Rename',
    onSubmit: async (path) => {
      if (path === note.path) return;
      const row = await ctx.api.saveNote(note.id, { path }, baseVersion);
      if (!row) throw new Error('This note just changed. Close this, then try again.');
      notes.set(row.id, row);
      baseVersion = row.version;
    },
  });
  history.replaceState(null, '', `${location.pathname}${location.search}${noteHash(notes.get(currentId).path)}`);
  render();
}

async function deleteNote() {
  const note = notes.get(currentId);
  if (!note) return;
  const yes = await confirmModal('Delete note', `Delete "${note.path}"? Its discussion and task links go with it. The note's last copy stays in the database history.`);
  if (!yes) return;
  try {
    await ctx.api.removeNote(note.id);
    notes.delete(note.id);
    closeNote();
    ctx.changed();
  } catch (err) {
    toast(friendly(err), 6000);
  }
}

// ---------- History ----------

async function showHistory() {
  const note = notes.get(currentId);
  if (!note) return;
  let versions;
  try {
    versions = await ctx.api.listVersions(note.id);
  } catch (err) {
    toast(friendly(err), 6000);
    return;
  }

  if (!versions.length) {
    modal({
      title: 'History',
      body: el('p', { class: 'muted', text: 'No older versions yet. Every save keeps the previous copy here.' }),
      buttons: [{ label: 'Close', primary: true }],
    });
    return;
  }

  const view = el('pre', { class: 'version-view' });
  let picked = versions[0];
  const list = el('div', { class: 'version-list' });
  const pick = (v, btn) => {
    picked = v;
    view.textContent = v.content;
    list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  };
  versions.forEach((v, i) => {
    const btn = el('button', { class: 'version', type: 'button', 'aria-pressed': 'false' }, [
      el('b', { text: `Version ${v.version}` }),
      el('span', { text: `${ctx.nameOf(v.edited_by)} · ${timeAgo(v.edited_at)}` }),
    ]);
    btn.addEventListener('click', () => pick(v, btn));
    list.append(btn);
    if (i === 0) pick(v, btn);
  });

  const choice = await modal({
    title: `History: ${baseName(note.path)}`,
    wide: true,
    body: el('div', { class: 'version-layout' }, [list, view]),
    buttons: [
      { label: 'Close' },
      { label: 'Put in editor', value: 'restore', primary: true },
    ],
  });

  if (choice === 'restore') {
    editor.value = picked.content;
    updatePreview();
    setDirty(true);
    toast('Old version is in the editor. Press Save to keep it.');
  }
}

// ---------- Import ----------

async function importFiles(fileList) {
  if (!ctx.state.schemaReady) {
    toast('Run supabase/002_vault_colors.sql first.', 6000);
    return;
  }

  const candidates = [];
  let otherFiles = 0;
  let badNames = 0;
  let tooBig = 0;

  for (const file of fileList) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    if (parts.length > 1) parts.shift(); // drop the vault folder's own name
    if (parts.some((p) => p.startsWith('.'))) continue; // .obsidian, .trash, .git
    if (!/\.md$/i.test(file.name)) {
      otherFiles += 1;
      continue;
    }
    const path = normalizePath(parts.join('/'));
    if (pathProblem(path)) badNames += 1;
    else if (file.size > MAX_NOTE) tooBig += 1;
    else candidates.push({ file, path });
  }

  if (!candidates.length) {
    toast('No Markdown notes found in that folder.', 6000);
    return;
  }

  const existing = candidates.filter((c) => findByPath(c.path));
  const fresh = candidates.filter((c) => !findByPath(c.path));
  const skippedText = [
    otherFiles ? `${otherFiles} non-note file${otherFiles === 1 ? '' : 's'} (images and so on) won't be imported.` : '',
    badNames ? `${badNames} note${badNames === 1 ? ' has a name' : 's have names'} HQ can't use.` : '',
    tooBig ? `${tooBig} note${tooBig === 1 ? ' is' : 's are'} over the size limit.` : '',
  ].filter(Boolean).join(' ');

  const buttons = [{ label: 'Cancel' }];
  if (existing.length) buttons.push({ label: 'New + overwrite', value: 'all', danger: true });
  if (fresh.length) buttons.push({ label: existing.length ? 'New notes only' : 'Import', value: 'new', primary: true });

  const choice = await modal({
    title: 'Import vault',
    body: [
      el('p', { text: `${fresh.length} new note${fresh.length === 1 ? '' : 's'}, ${existing.length} already in HQ.` }),
      skippedText ? el('p', { class: 'muted small', text: skippedText }) : null,
      existing.length ? el('p', { class: 'muted small', text: 'Overwriting keeps the old copies in History.' }) : null,
    ],
    buttons,
  });
  if (choice !== 'new' && choice !== 'all') return;

  const clean = async (c) => ({ path: c.path, content: (await c.file.text()).replace(/\r\n/g, '\n') });
  let done = 0;
  try {
    for (let i = 0; i < fresh.length; i += 50) {
      const rows = await Promise.all(fresh.slice(i, i + 50).map(clean));
      for (const row of await ctx.api.insertNotes(rows)) notes.set(row.id, row);
      done += rows.length;
      toast(`Imported ${done} of ${fresh.length}…`);
    }
    let overwritten = 0;
    if (choice === 'all') {
      for (const c of existing) {
        const note = findByPath(c.path);
        if (note.id === currentId && dirty) continue;
        const { content } = await clean(c);
        if (content === note.content) continue;
        const row = await ctx.api.saveNote(note.id, { content }, note.version);
        if (row) {
          applyServerNote(row);
          overwritten += 1;
        }
      }
    }
    render();
    toast(`Imported ${done} new note${done === 1 ? '' : 's'}${overwritten ? `, overwrote ${overwritten}` : ''}.`, 6000);
  } catch (err) {
    render();
    toast(`Stopped after ${done}: ${friendly(err)}`, 8000);
  }
}

// ---------- Setup ----------

export function init(context) {
  ctx = context;
  loadMarkdown().then(
    () => {
      if (currentId) updatePreview();
    },
    (err) => {
      console.error(err);
      toast("Couldn't load the Markdown preview. Editing still works.", 6000);
    },
  );
  applyMode();

  $('#note-bundle').addEventListener('click', () => {
    if (currentId) ctx.addNoteToBundle(currentId);
  });

  $('#note-discuss').addEventListener('click', () => {
    threadOpen = !threadOpen;
    store.set('noteThread', threadOpen ? '1' : '0');
    showThread();
    if (threadOpen) thread?.focus();
  });

  $('#note-new').addEventListener('click', () => newNote());
  $('#note-save').addEventListener('click', save);
  $('#note-rename').addEventListener('click', renameNote);
  $('#note-delete').addEventListener('click', deleteNote);
  $('#note-history').addEventListener('click', showHistory);
  $('#note-back').addEventListener('click', () => $('#tool-vault').classList.remove('note-open'));

  const input = $('#note-import-input');
  $('#note-import').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    importFiles([...input.files]);
    input.value = '';
  });

  editor.addEventListener('input', () => {
    setDirty(true);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 120);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('#tool-vault').hidden && currentId) {
      e.preventDefault();
      save();
    }
  });

  $('#note-modes').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    mode = chip.dataset.mode;
    store.set('noteMode', mode);
    applyMode();
  });

  const search = $('#note-search');
  search.addEventListener('input', () => {
    query = search.value.trim();
    renderTree();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && query) {
      const first = searchResults()[0];
      if (first) open(first.id);
    } else if (e.key === 'Escape') {
      search.value = '';
      query = '';
      renderTree();
    }
  });

  preview.addEventListener('click', (e) =>
    handleLinkClick(e, {
      resolveLink,
      openNote: open,
      missing: (name) => newNote(name),
    }),
  );

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  renderTree();
}
