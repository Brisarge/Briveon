// Everything HQ reads from or writes to Supabase. demo.js mirrors these methods.

const PAGE = 1000; // Supabase returns at most this many rows per request

export function supabaseApi(sb, getUserId) {
  const check = ({ data, error }) => {
    if (error) throw error;
    return data;
  };

  // Keeps asking until every row has arrived.
  const fetchAll = async (makeQuery) => {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = check(await makeQuery().range(from, from + PAGE - 1));
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  };

  return {
    isAdmin: async () => check(await sb.rpc('is_admin')),

    // Tasks
    listTasks: () => fetchAll(() => sb.from('tasks').select('*').order('position').order('id')),
    insertTask: async (row) => check(await sb.from('tasks').insert(row).select().single()),
    updateTask: async (id, patch) => check(await sb.from('tasks').update(patch).eq('id', id).select().single()),
    removeTask: async (id) => check(await sb.from('tasks').delete().eq('id', id)),

    // Projects (colors)
    listProjects: async () => check(await sb.from('projects').select('*')),
    setProjectColor: async (name, color) => check(await sb.from('projects').upsert({ name, color }).select().single()),

    // Profiles
    listProfiles: async () => check(await sb.from('profiles').select('*')),
    setMyName: async (name) => check(await sb.from('profiles').upsert({ id: getUserId(), name }).select().single()),

    // Notes
    listNotes: () => fetchAll(() => sb.from('notes').select('*').order('path')),
    getNote: async (id) => check(await sb.from('notes').select('*').eq('id', id).maybeSingle()),
    insertNotes: async (rows) => check(await sb.from('notes').insert(rows).select()),
    // Saves only if nobody else saved first. Returns null when the version moved on.
    saveNote: async (id, patch, version) => {
      const rows = check(await sb.from('notes').update(patch).eq('id', id).eq('version', version).select());
      return rows[0] ?? null;
    },
    removeNote: async (id) => check(await sb.from('notes').delete().eq('id', id)),
    listVersions: async (id) =>
      check(await sb.from('note_versions').select('*').eq('note_id', id).order('id', { ascending: false }).limit(100)),

    // Links between tasks and notes
    listLinks: () => fetchAll(() => sb.from('task_notes').select('*').order('created_at').order('task_id').order('note_id')),
    linkNote: async (taskId, noteId) =>
      check(await sb.from('task_notes').insert({ task_id: taskId, note_id: noteId }).select().single()),
    unlinkNote: async (taskId, noteId) =>
      check(await sb.from('task_notes').delete().eq('task_id', taskId).eq('note_id', noteId)),

    // Discussion
    listComments: () => fetchAll(() => sb.from('comments').select('*').order('created_at').order('id')),
    addComment: async (row) => check(await sb.from('comments').insert(row).select().single()),
    removeComment: async (id) => check(await sb.from('comments').delete().eq('id', id)),

    // Activity
    listActivity: async ({ before = null, limit = 60 } = {}) => {
      let query = sb.from('activity').select('*').order('created_at', { ascending: false }).limit(limit);
      if (before) query = query.lt('created_at', before);
      return check(await query);
    },

    subscribe(tables, onChange, onStatus) {
      let channel = sb.channel('hq-live');
      for (const table of tables) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) =>
          onChange(table, payload),
        );
      }
      channel.subscribe(onStatus);
      return () => sb.removeChannel(channel);
    },
  };
}
