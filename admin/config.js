// Admin settings. Fill in the two Supabase values after creating the project
// (steps in README.md, "Admin setup").
//
// Both values are meant to be public: browsers need them to talk to Supabase.
// What keeps the data private is the database rules in supabase/schema.sql
// (only emails listed in the `admins` table can read or change anything).

// Supabase > Project Settings > Data API > Project URL, e.g. 'https://abcdefghijkl.supabase.co'
export const SUPABASE_URL = '';

// Supabase > Project Settings > API Keys > the "publishable" key (or the legacy "anon public" key).
// Never put the "secret" / "service_role" key here.
export const SUPABASE_KEY = '';

// Names shown in the assignee picker and filters.
export const TEAM = ['Bris', 'Rog'];

// Suggested project tags (you can still type any tag).
export const PROJECTS = ['RealmNG', 'Labyrinth', 'Website'];
