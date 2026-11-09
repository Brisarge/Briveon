// In-memory stand-in for Supabase. Only used at localhost/admin/?demo, resets on reload.

export const DEMO_USER = { id: 'demo-bris', email: 'demo mode (localhost)' };

export function demoApi() {
  const now = Date.now();
  const stamp = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  const id = () => crypto.randomUUID();
  const copy = (r) => ({ ...r });
  const nowIso = () => new Date().toISOString();

  let tasks = [
    { title: 'Write blurbs for Climb of Chaos and Tower Destruction', project: 'Website', assignee: 'Bris', status: 'todo' },
    { title: 'Playtest Labyrinth floor 3 on mobile', project: 'Labyrinth', assignee: 'Rog', status: 'todo', notes: 'Moving platforms felt off on touch controls.' },
    { title: 'Fix a save loss report', project: 'RealmNG', assignee: 'Rog', status: 'todo', color: '#ef5a5a', notes: 'Own red color, overriding the project color.' },
    { title: 'Boss repeat: UTC midnight or rolling 24 h?', project: 'RealmNG', assignee: 'Both', status: 'doing' },
    { title: 'Swap DEV product IDs for the public ones', project: 'RealmNG', assignee: 'Bris', status: 'done' },
  ].map((r, i) => ({ id: id(), notes: '', color: null, position: now - 10000 + i * 1000, ...r }));

  const projects = [
    { name: 'RealmNG', color: '#a47bf0' },
    { name: 'Labyrinth', color: '#3fc9c9' },
  ];
  const profiles = [
    { id: 'demo-bris', name: 'Bris' },
    { id: 'demo-rog', name: 'Rog' },
  ];

  let notes = [
    {
      path: 'Docs/Workflow.md',
      by: 'demo-bris',
      mins: 30,
      content: '# Workflow\n\nHow Bris and Rog ship.\n\nSee [[Combat]] and [[Missing Note]].\n\n- [x] Vault in HQ\n- [ ] Threads on notes\n\n```lua\nlocal rate = 60 / bpm\n```\n',
    },
    {
      path: 'Specs/Combat.md',
      by: 'demo-rog',
      mins: 300,
      content: '---\ntags: [realmng]\n---\n# Combat\n\nAbility ordering rules. Back to [[Workflow|the workflow]].\n\n| Ability | Order |\n|---|---|\n| Multi Shot | After attack |\n\n<img src=x onerror="document.title=\'hacked\'">\n<script>document.title="hacked"</script>\n',
    },
    { path: 'Specs/Labyrinth/Floors.md', by: 'demo-rog', mins: 2000, content: '# Floors\n\nFloor generation notes.\n' },
    { path: 'Ideas.md', by: 'demo-bris', mins: 5, content: '# Ideas\n\nRough stuff.\n' },
  ].map((n) => ({
    id: id(),
    path: n.path,
    content: n.content,
    version: 1,
    created_by: n.by,
    updated_by: n.by,
    created_at: stamp(n.mins),
    updated_at: stamp(n.mins),
  }));

  const versions = [];
  const taskAt = (i) => tasks[i].id;
  const noteAt = (path) => notes.find((n) => n.path === path).id;

  let links = [
    { task_id: taskAt(3), note_id: noteAt('Specs/Combat.md'), created_at: stamp(120) },
    { task_id: taskAt(3), note_id: noteAt('Docs/Workflow.md'), created_at: stamp(110) },
    { task_id: taskAt(1), note_id: noteAt('Specs/Labyrinth/Floors.md'), created_at: stamp(100) },
  ];

  let comments = [
    { id: id(), task_id: taskAt(3), note_id: null, body: 'I lean rolling 24 h, players on the wrong side of midnight get hosed.', author: 'demo-rog', created_at: stamp(90) },
    { id: id(), task_id: taskAt(3), note_id: null, body: 'Agreed. Check **[[Combat]]** before changing it.\n\n<img src=x onerror="document.title=\'hacked\'">', author: 'demo-bris', created_at: stamp(45) },
    { id: id(), task_id: null, note_id: noteAt('Specs/Combat.md'), body: 'Does Multi Shot fire before Ancient Flame?', author: 'demo-rog', created_at: stamp(200) },
  ];

  let nextActivity = 1;
  let activity = [];
  const log = (row, at) =>
    activity.unshift({
      id: nextActivity++,
      actor: DEMO_USER.id,
      task_id: null,
      note_id: null,
      comment_id: null,
      detail: null,
      item_count: 1,
      created_at: at || nowIso(),
      ...row,
    });

  log({ kind: 'note_created', actor: 'demo-rog', note_id: noteAt('Specs/Combat.md'), title: 'Specs/Combat.md' }, stamp(60 * 30));
  log({ kind: 'note_created', title: 'Docs/Workflow.md', item_count: 12 }, stamp(60 * 26));
  log({ kind: 'task_created', actor: 'demo-rog', task_id: taskAt(1), title: tasks[1].title, detail: 'todo' }, stamp(180));
  log({ kind: 'note_linked', actor: 'demo-rog', task_id: taskAt(3), note_id: noteAt('Specs/Combat.md'), title: tasks[3].title, detail: 'Specs/Combat.md' }, stamp(120));
  log({ kind: 'comment', actor: 'demo-rog', task_id: taskAt(3), comment_id: comments[0].id, title: tasks[3].title, detail: comments[0].body }, stamp(90));
  log({ kind: 'task_moved', task_id: taskAt(3), title: tasks[3].title, detail: 'doing' }, stamp(60));
  log({ kind: 'comment', task_id: taskAt(3), comment_id: comments[1].id, title: tasks[3].title, detail: comments[1].body }, stamp(45));
  log({ kind: 'note_edited', note_id: noteAt('Docs/Workflow.md'), title: 'Docs/Workflow.md' }, stamp(30));
  log({ kind: 'task_deleted', actor: 'demo-rog', title: 'Old test task' }, stamp(12));

  const pathTaken = (path, exceptId) =>
    notes.some((n) => n.id !== exceptId && n.path.toLowerCase() === path.toLowerCase());
  const conflict = () => Object.assign(new Error('duplicate path'), { code: '23505' });

  return {
    isAdmin: async () => true,

    listTasks: async () => tasks.map(copy),
    insertTask: async (row) => {
      const r = { id: id(), notes: '', color: null, ...row };
      tasks.push(r);
      log({ kind: 'task_created', task_id: r.id, title: r.title, detail: r.status });
      return copy(r);
    },
    updateTask: async (taskId, patch) => {
      const r = tasks.find((x) => x.id === taskId);
      const before = copy(r);
      Object.assign(r, patch);
      if (r.status !== before.status) log({ kind: 'task_moved', task_id: r.id, title: r.title, detail: r.status });
      if (r.assignee !== before.assignee) log({ kind: 'task_assigned', task_id: r.id, title: r.title, detail: r.assignee });
      if (r.title !== before.title || r.notes !== before.notes || r.project !== before.project) {
        log({ kind: 'task_edited', task_id: r.id, title: r.title });
      }
      return copy(r);
    },
    removeTask: async (taskId) => {
      const r = tasks.find((x) => x.id === taskId);
      tasks = tasks.filter((x) => x.id !== taskId);
      links = links.filter((l) => l.task_id !== taskId);
      comments = comments.filter((c) => c.task_id !== taskId);
      if (r) log({ kind: 'task_deleted', title: r.title });
    },

    listProjects: async () => projects.map(copy),
    setProjectColor: async (name, color) => {
      const row = projects.find((p) => p.name === name);
      if (row) row.color = color;
      else projects.push({ name, color });
      return { name, color };
    },

    listProfiles: async () => profiles.map(copy),
    setMyName: async (name) => ({ id: DEMO_USER.id, name }),

    listNotes: async () => notes.map(copy),
    getNote: async (noteId) => {
      const n = notes.find((x) => x.id === noteId);
      return n ? copy(n) : null;
    },
    insertNotes: async (rows) => {
      const out = [];
      for (const row of rows) {
        if (pathTaken(row.path)) throw conflict();
        const n = {
          id: id(),
          content: '',
          version: 1,
          created_by: DEMO_USER.id,
          updated_by: DEMO_USER.id,
          created_at: nowIso(),
          updated_at: nowIso(),
          ...row,
        };
        notes.push(n);
        out.push(copy(n));
      }
      if (out.length) log({ kind: 'note_created', note_id: out.length === 1 ? out[0].id : null, title: out[0].path, item_count: out.length });
      return out;
    },
    saveNote: async (noteId, patch, version) => {
      const n = notes.find((x) => x.id === noteId);
      if (!n || n.version !== version) return null;
      if (patch.path && pathTaken(patch.path, noteId)) throw conflict();
      versions.unshift({
        id: versions.length + 1,
        note_id: n.id,
        path: n.path,
        content: n.content,
        version: n.version,
        edited_by: n.updated_by,
        edited_at: n.updated_at,
      });
      const oldPath = n.path;
      Object.assign(n, patch, { version: n.version + 1, updated_by: DEMO_USER.id, updated_at: nowIso() });
      if (patch.path && patch.path !== oldPath) log({ kind: 'note_moved', note_id: n.id, title: n.path, detail: oldPath });
      else log({ kind: 'note_edited', note_id: n.id, title: n.path });
      return copy(n);
    },
    removeNote: async (noteId) => {
      const n = notes.find((x) => x.id === noteId);
      notes = notes.filter((x) => x.id !== noteId);
      links = links.filter((l) => l.note_id !== noteId);
      comments = comments.filter((c) => c.note_id !== noteId);
      if (n) log({ kind: 'note_deleted', title: n.path });
    },
    listVersions: async (noteId) => versions.filter((v) => v.note_id === noteId).map(copy),

    listLinks: async () => links.map(copy),
    linkNote: async (taskId, noteId) => {
      const row = { task_id: taskId, note_id: noteId, created_at: nowIso() };
      links.push(row);
      log({
        kind: 'note_linked',
        task_id: taskId,
        note_id: noteId,
        title: tasks.find((t) => t.id === taskId)?.title || 'Untitled',
        detail: notes.find((n) => n.id === noteId)?.path,
      });
      return copy(row);
    },
    unlinkNote: async (taskId, noteId) => {
      links = links.filter((l) => !(l.task_id === taskId && l.note_id === noteId));
    },

    listComments: async () => comments.map(copy),
    addComment: async (row) => {
      const c = { id: id(), task_id: null, note_id: null, author: DEMO_USER.id, created_at: nowIso(), ...row };
      comments.push(c);
      const about = c.task_id ? tasks.find((t) => t.id === c.task_id)?.title : notes.find((n) => n.id === c.note_id)?.path;
      log({ kind: 'comment', task_id: c.task_id, note_id: c.note_id, comment_id: c.id, title: about || 'Untitled', detail: c.body.slice(0, 200) });
      return copy(c);
    },
    removeComment: async (commentId) => {
      comments = comments.filter((c) => c.id !== commentId);
      activity = activity.filter((a) => a.comment_id !== commentId);
    },

    listActivity: async ({ before = null, limit = 60 } = {}) =>
      activity
        .filter((a) => !before || a.created_at < before)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map(copy),

    // Test hook: pretend the other person saved a note.
    _simulateRogEdit(noteId, content) {
      const n = notes.find((x) => x.id === noteId);
      Object.assign(n, { content, version: n.version + 1, updated_by: 'demo-rog', updated_at: nowIso() });
      return copy(n);
    },

    subscribe(_tables, _onChange, onStatus) {
      onStatus('SUBSCRIBED');
      return () => {};
    },
  };
}
