-- Briveon HQ update: shared notes vault, color coding, profiles, read-only AI access.
-- Run once AFTER schema.sql: SQL Editor > New query > paste this whole file > Run.
-- Safe to run again (it skips what already exists).

-- 1. Color coding -----------------------------------------------------------------
alter table public.tasks
  add column if not exists color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

create table if not exists public.projects (
  name  text primary key check (char_length(name) between 1 and 60),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$')
);
alter table public.projects enable row level security;

drop policy if exists "admins read projects" on public.projects;
drop policy if exists "admins add projects" on public.projects;
drop policy if exists "admins edit projects" on public.projects;
drop policy if exists "admins delete projects" on public.projects;
create policy "admins read projects" on public.projects
  for select to authenticated using (public.is_admin());
create policy "admins add projects" on public.projects
  for insert to authenticated with check (public.is_admin());
create policy "admins edit projects" on public.projects
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete projects" on public.projects
  for delete to authenticated using (public.is_admin());

-- 2. Who is who (filled in by HQ the first time each of you signs in) -------------
create table if not exists public.profiles (
  id   uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);
alter table public.profiles enable row level security;

drop policy if exists "admins read profiles" on public.profiles;
drop policy if exists "admins set own profile" on public.profiles;
drop policy if exists "admins edit own profile" on public.profiles;
create policy "admins read profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "admins set own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid() and public.is_admin());
create policy "admins edit own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_admin())
  with check (id = auth.uid() and public.is_admin());

-- 3. The vault ---------------------------------------------------------------------
-- Folders are just part of the path, like Docs/Specs/Combat.md.
-- The path rules matter: these paths become real files when the vault is pulled
-- onto someone's PC, so they can't climb out of the folder or be hidden files.
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  path        text not null
              check (char_length(path) between 4 and 300)
              check (path ~* '\.md$')
              check (path !~ '[\\<>:"|?*[:cntrl:]]')
              check (path !~ '^/|/$|//')
              check (path !~ '(^|/)[. ]')
              check (path !~ '[. ]/'),
  content     text not null default '' check (char_length(content) <= 1000000),
  version     integer not null default 1,
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists notes_path_unique on public.notes (lower(path));
alter table public.notes enable row level security;

drop policy if exists "admins read notes" on public.notes;
drop policy if exists "admins add notes" on public.notes;
drop policy if exists "admins edit notes" on public.notes;
drop policy if exists "admins delete notes" on public.notes;
create policy "admins read notes" on public.notes
  for select to authenticated using (public.is_admin());
create policy "admins add notes" on public.notes
  for insert to authenticated with check (public.is_admin());
create policy "admins edit notes" on public.notes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete notes" on public.notes
  for delete to authenticated using (public.is_admin());

-- Every older copy of a note is kept here, including the last copy of deleted notes.
create table if not exists public.note_versions (
  id         bigint generated always as identity primary key,
  note_id    uuid not null,
  path       text not null,
  content    text not null,
  version    integer not null,
  edited_by  uuid,
  edited_at  timestamptz not null,
  deleted    boolean not null default false
);
create index if not exists note_versions_note on public.note_versions (note_id, id desc);
alter table public.note_versions enable row level security;

drop policy if exists "admins read note versions" on public.note_versions;
create policy "admins read note versions" on public.note_versions
  for select to authenticated using (public.is_admin());

create or replace function public.notes_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.content is distinct from old.content or new.path is distinct from old.path then
    insert into public.note_versions (note_id, path, content, version, edited_by, edited_at)
    values (old.id, old.path, old.content, old.version, old.updated_by, old.updated_at);
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create or replace function public.notes_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.note_versions (note_id, path, content, version, edited_by, edited_at, deleted)
  values (old.id, old.path, old.content, old.version, old.updated_by, old.updated_at, true);
  return old;
end;
$$;

drop trigger if exists notes_before_write on public.notes;
create trigger notes_before_write
  before insert or update on public.notes
  for each row execute function public.notes_before_write();

drop trigger if exists notes_after_delete on public.notes;
create trigger notes_after_delete
  after delete on public.notes
  for each row execute function public.notes_after_delete();

-- 4. Read-only vault access for your AIs -------------------------------------------
-- An AI never gets a login. It gets a token that can do exactly one thing: read notes.
-- Only a scrambled copy of each token is stored, so tokens can't be read back from here.
create table if not exists public.vault_tokens (
  id           bigint generated always as identity primary key,
  label        text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
alter table public.vault_tokens enable row level security;
-- No policies on purpose: browsers can't touch this table.

create or replace function public.create_vault_token(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text := 'vault_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.vault_tokens (label, token_hash)
  values (p_label, encode(sha256(convert_to(raw, 'UTF8')), 'hex'));
  return raw;
end;
$$;

create or replace function public.vault_read(p_token text, p_after text default '', p_limit integer default 200)
returns table (path text, content text, version integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  update public.vault_tokens t
     set last_used_at = now()
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and t.revoked_at is null
  returning true into ok;

  if ok is not true then
    raise exception 'invalid vault token' using errcode = '42501';
  end if;

  return query
    select n.path, n.content, n.version, n.updated_at
      from public.notes n
     where n.path collate "C" > coalesce(p_after, '') collate "C"
     order by n.path collate "C"
     limit least(greatest(coalesce(p_limit, 200), 1), 200);
end;
$$;

-- Tokens can only be created from this SQL Editor, never from a browser.
revoke all on function public.create_vault_token(text) from public, anon, authenticated;
revoke all on function public.vault_read(text, text, integer) from public;
grant execute on function public.vault_read(text, text, integer) to anon, authenticated;
-- The trigger functions aren't meant to be called directly either.
revoke all on function public.notes_before_write() from public, anon, authenticated;
revoke all on function public.notes_after_delete() from public, anon, authenticated;

-- 5. Live updates -------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['notes', 'projects', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- 6. Make an AI token (run separately, once per person) -----------------------------
-- select public.create_vault_token('Bris');
-- select public.create_vault_token('Rog');
-- Each one prints a token once. Save it as described in README.md.
-- To cut one off later:
-- update public.vault_tokens set revoked_at = now() where label = 'Rog';
