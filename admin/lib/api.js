// Everything HQ reads from or writes to Supabase. demo.js mirrors these methods.

export function supabaseApi(sb, getUserId) {
  const check = ({ data, error }) => {
    if (error) throw error;
    return data;
  };

  return {
    isAdmin: async () => check(await sb.rpc('is_admin')),

    // Tasks
    listTasks: async () => check(await sb.from('tasks').select('*').order('position')),
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
    listNotes: async () => check(await sb.from('notes').select('*').order('path')),
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
