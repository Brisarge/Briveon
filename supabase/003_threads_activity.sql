-- Briveon HQ update: linked notes, discussion threads, activity feed.
-- Run once AFTER 002_vault_colors.sql: SQL Editor > New query > paste this whole file > Run.
-- Safe to run again (it skips what already exists).

-- 1. Linking notes to tasks ---------------------------------------------------------
create table if not exists public.task_notes (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  note_id    uuid not null references public.notes (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, note_id)
);
create index if not exists task_notes_note on public.task_notes (note_id);
alter table public.task_notes enable row level security;

drop policy if exists "admins read links" on public.task_notes;
drop policy if exists "admins add links" on public.task_notes;
drop policy if exists "admins remove links" on public.task_notes;
create policy "admins read links" on public.task_notes
  for select to authenticated using (public.is_admin());
create policy "admins add links" on public.task_notes
  for insert to authenticated with check (public.is_admin());
create policy "admins remove links" on public.task_notes
  for delete to authenticated using (public.is_admin());

-- 2. Discussion threads ---------------------------------------------------------------
-- A comment belongs to exactly one task or one note.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references public.tasks (id) on delete cascade,
  note_id    uuid references public.notes (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 10000),
  author     uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((task_id is null) <> (note_id is null))
);
create index if not exists comments_task on public.comments (task_id, created_at);
create index if not exists comments_note on public.comments (note_id, created_at);
alter table public.comments enable row level security;

drop policy if exists "admins read comments" on public.comments;
drop policy if exists "admins add comments" on public.comments;
drop policy if exists "authors delete comments" on public.comments;
create policy "admins read comments" on public.comments
  for select to authenticated using (public.is_admin());
create policy "admins add comments" on public.comments
  for insert to authenticated with check (public.is_admin());
create policy "authors delete comments" on public.comments
  for delete to authenticated using (author = auth.uid() and public.is_admin());

create or replace function public.stamp_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.stamp_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists comments_stamp on public.comments;
create trigger comments_stamp before insert on public.comments
  for each row execute function public.stamp_comment();

drop trigger if exists task_notes_stamp on public.task_notes;
create trigger task_notes_stamp before insert on public.task_notes
  for each row execute function public.stamp_link();

-- 3. Activity feed ----------------------------------------------------------------------
-- Written only by the database triggers below, so it can't be skipped or faked from
-- a browser. Titles are copied in, so entries still read fine after a task is deleted.
create table if not exists public.activity (
  id         bigint generated always as identity primary key,
  kind       text not null,
  actor      uuid,
  task_id    uuid,
  note_id    uuid,
  comment_id uuid,
  title      text not null,
  detail     text,
  item_count integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists activity_recent on public.activity (created_at desc);
create index if not exists activity_comment on public.activity (comment_id);
alter table public.activity enable row level security;

drop policy if exists "admins read activity" on public.activity;
create policy "admins read activity" on public.activity
  for select to authenticated using (public.is_admin());

create or replace function public.activity_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  recent bigint;
begin
  if tg_op = 'INSERT' then
    insert into activity (kind, actor, task_id, title, detail)
    values ('task_created', me, new.id, new.title, new.status);
    return new;
  elsif tg_op = 'DELETE' then
    insert into activity (kind, actor, title) values ('task_deleted', me, old.title);
    return old;
  end if;

  if new.status is distinct from old.status then
    insert into activity (kind, actor, task_id, title, detail)
    values ('task_moved', me, new.id, new.title, new.status);
  end if;
  if new.assignee is distinct from old.assignee then
    insert into activity (kind, actor, task_id, title, detail)
    values ('task_assigned', me, new.id, new.title, new.assignee);
  end if;
  if new.title is distinct from old.title
     or new.notes is distinct from old.notes
     or new.project is distinct from old.project then
    -- Repeated edits within 15 minutes count as one entry.
    select id into recent from activity
     where kind = 'task_edited' and task_id = new.id and actor is not distinct from me
       and created_at > now() - interval '15 minutes'
     order by id desc limit 1;
    if recent is not null then
      update activity set created_at = now(), title = new.title where id = recent;
    else
      insert into activity (kind, actor, task_id, title) values ('task_edited', me, new.id, new.title);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.activity_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  recent bigint;
begin
  if tg_op = 'INSERT' then
    -- A vault import becomes one entry ("added 40 notes"), not 40.
    select id into recent from activity
     where kind = 'note_created' and actor is not distinct from me
       and created_at > now() - interval '1 minute'
     order by id desc limit 1;
    if recent is not null then
      update activity
         set item_count = item_count + 1, created_at = now(), note_id = null
       where id = recent;
    else
      insert into activity (kind, actor, note_id, title) values ('note_created', me, new.id, new.path);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into activity (kind, actor, title) values ('note_deleted', me, old.path);
    return old;
  end if;

  if new.path is distinct from old.path then
    insert into activity (kind, actor, note_id, title, detail)
    values ('note_moved', me, new.id, new.path, old.path);
  end if;
  if new.content is distinct from old.content then
    select id into recent from activity
     where kind = 'note_edited' and note_id = new.id and actor is not distinct from me
       and created_at > now() - interval '15 minutes'
     order by id desc limit 1;
    if recent is not null then
      update activity set created_at = now(), title = new.path where id = recent;
    else
      insert into activity (kind, actor, note_id, title) values ('note_edited', me, new.id, new.path);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.activity_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  about text;
begin
  if tg_op = 'DELETE' then
    delete from activity where comment_id = old.id;
    return old;
  end if;

  if new.task_id is not null then
    select title into about from tasks where id = new.task_id;
  else
    select path into about from notes where id = new.note_id;
  end if;
  insert into activity (kind, actor, task_id, note_id, comment_id, title, detail)
  values ('comment', new.author, new.task_id, new.note_id, new.id, coalesce(about, 'Untitled'), left(new.body, 200));
  return new;
end;
$$;

create or replace function public.activity_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_title text;
  note_path text;
begin
  select title into task_title from tasks where id = new.task_id;
  select path into note_path from notes where id = new.note_id;
  insert into activity (kind, actor, task_id, note_id, title, detail)
  values ('note_linked', new.created_by, new.task_id, new.note_id, coalesce(task_title, 'Untitled'), note_path);
  return new;
end;
$$;

drop trigger if exists tasks_activity on public.tasks;
create trigger tasks_activity after insert or update or delete on public.tasks
  for each row execute function public.activity_tasks();

drop trigger if exists notes_activity on public.notes;
create trigger notes_activity after insert or update or delete on public.notes
  for each row execute function public.activity_notes();

drop trigger if exists comments_activity on public.comments;
create trigger comments_activity after insert or delete on public.comments
  for each row execute function public.activity_comments();

drop trigger if exists task_notes_activity on public.task_notes;
create trigger task_notes_activity after insert on public.task_notes
  for each row execute function public.activity_links();

-- None of these are meant to be called directly.
revoke all on function public.stamp_comment() from public, anon, authenticated;
revoke all on function public.stamp_link() from public, anon, authenticated;
revoke all on function public.activity_tasks() from public, anon, authenticated;
revoke all on function public.activity_notes() from public, anon, authenticated;
revoke all on function public.activity_comments() from public, anon, authenticated;
revoke all on function public.activity_links() from public, anon, authenticated;

-- 4. Live updates -------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['task_notes', 'comments', 'activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
