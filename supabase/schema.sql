-- Briveon HQ database setup.
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run.
-- Safe to run again later (it skips what already exists).

-- 1. Who counts as an admin ---------------------------------------------------
-- Only emails in this table can see or change anything. Browsers can't read or
-- edit this table at all (row level security on, no policies); you manage it
-- from the Supabase dashboard or the SQL Editor.
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2. The task board --------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  notes       text not null default '' check (char_length(notes) <= 5000),
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee    text check (char_length(assignee) <= 40),
  project     text check (char_length(project) <= 60),
  position    double precision not null default (extract(epoch from now()) * 1000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.tasks enable row level security;

drop policy if exists "admins read tasks" on public.tasks;
drop policy if exists "admins add tasks" on public.tasks;
drop policy if exists "admins edit tasks" on public.tasks;
drop policy if exists "admins delete tasks" on public.tasks;

create policy "admins read tasks" on public.tasks
  for select to authenticated using (public.is_admin());
create policy "admins add tasks" on public.tasks
  for insert to authenticated with check (public.is_admin());
create policy "admins edit tasks" on public.tasks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete tasks" on public.tasks
  for delete to authenticated using (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- 3. Live updates (so Rog sees your changes without refreshing) ----------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;

-- 4. Add the two admin emails -----------------------------------------------------
-- Use the same emails you create under Authentication > Users.
-- Remove the leading "--" from the line below, put the real emails in, and run it.
-- insert into public.admins (email) values ('bris@example.com'), ('rog@example.com') on conflict do nothing;
