// In-memory stand-in for Supabase. Only used at localhost/admin/?demo, resets on reload.

export const DEMO_USER = { id: 'demo-bris', email: 'demo mode (localhost)' };

export function demoApi() {
  const now = Date.now();
  const stamp = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  const id = () => crypto.randomUUID();
  const copy = (r) => ({ ...r });

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

  const pathTaken = (path, exceptId) =>
    notes.some((n) => n.id !== exceptId && n.path.toLowerCase() === path.toLowerCase());
  const conflict = () => Object.assign(new Error('duplicate path'), { code: '23505' });

  return {
    isAdmin: async () => true,

    listTasks: async () => tasks.map(copy),
    insertTask: async (row) => {
      const r = { id: id(), notes: '', color: null, ...row };
      tasks.push(r);
      return copy(r);
    },
    updateTask: async (taskId, patch) => {
      const r = tasks.find((x) => x.id === taskId);
      Object.assign(r, patch);
      return copy(r);
    },
    removeTask: async (taskId) => {
      tasks = tasks.filter((x) => x.id !== taskId);
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        notes.push(n);
        out.push(copy(n));
      }
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
      Object.assign(n, patch, {
        version: n.version + 1,
        updated_by: DEMO_USER.id,
        updated_at: new Date().toISOString(),
      });
      return copy(n);
    },
    removeNote: async (noteId) => {
      notes = notes.filter((x) => x.id !== noteId);
    },
    listVersions: async (noteId) => versions.filter((v) => v.note_id === noteId).map(copy),

    // Test hook: pretend the other person saved a note.
    _simulateRogEdit(noteId, content) {
      const n = notes.find((x) => x.id === noteId);
      Object.assign(n, { content, version: n.version + 1, updated_by: 'demo-rog', updated_at: new Date().toISOString() });
      return copy(n);
    },

    subscribe(_tables, _onChange, onStatus) {
      onStatus('SUBSCRIBED');
      return () => {};
    },
  };
}
