-- Briveon HQ update: Discord alerts, sent straight from the database.
-- Run once AFTER 003_threads_activity.sql: SQL Editor > New query > paste this whole file > Run.
-- Safe to run again. Nothing is sent until you add a webhook URL (see step 5 at the bottom).

create extension if not exists pg_net;

-- 1. Private settings -----------------------------------------------------------------
-- The webhook URL lets anyone who has it post to your channel, so it lives here:
-- row level security on, no policies, so browsers can't read it. Never put it in the repo.
create table if not exists public.hq_settings (
  id             boolean primary key default true check (id),
  discord_webhook text check (
    discord_webhook is null
    or discord_webhook ~ '^https://(ptb\.|canary\.)?(discord\.com|discordapp\.com)/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
  )
);
alter table public.hq_settings drop column if exists last_digest_at;
insert into public.hq_settings (id) values (true) on conflict (id) do nothing;
alter table public.hq_settings enable row level security;

-- 2. Sending ------------------------------------------------------------------------------
-- Stops Discord formatting in titles from breaking the message.
create or replace function public.discord_escape(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_text, ''), '([\\*_~`|\[\]()<>#])', '\\\1', 'g');
$$;

-- allowed_mentions stops text like @everyone in a comment from pinging anybody.
create or replace function public.discord_send(p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url text;
begin
  select discord_webhook into url from hq_settings where id;
  if url is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object(
      'content', left(p_message, 1900),
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end;
$$;

create or replace function public.discord_who(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select name from profiles where id = p_id), 'Someone');
$$;

-- 3. Alerts, sent as soon as things happen ------------------------------------------------
-- Repeated saves of the same note within 15 minutes share one activity entry, so a note
-- being worked on alerts once instead of on every save. The same goes for a vault import.
create or replace function public.discord_on_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  site constant text := 'https://briveon.net/admin/';
  who text := discord_escape(discord_who(new.actor));
  name text := discord_escape(left(new.title, 120));
  note_name text := discord_escape(left(regexp_replace(new.title, '\.md$', '', 'i'), 120));
  assigned text;
  link text;
  message text;
begin
  if new.task_id is not null then
    link := site || '#board/' || new.task_id;
  elsif new.note_id is not null and new.kind <> 'comment' then
    link := site || '#vault/' || replace(replace(replace(new.title, '%', '%25'), ' ', '%20'), '#', '%23');
  elsif new.note_id is not null then
    link := site || '#vault';
  else
    link := site;
  end if;

  if new.kind = 'comment' then
    message := format(E'\U0001F4AC **%s** commented on [%s](<%s>)\n> %s',
      who, name, link,
      replace(discord_escape(left(new.detail, 300)), E'\n', E'\n> '));
  elsif new.kind = 'task_moved' and new.detail = 'done' then
    message := format(E'✅ **%s** finished [%s](<%s>)', who, name, link);
  elsif new.kind = 'task_assigned' and new.detail is not null then
    message := format(E'\U0001F464 **%s** assigned [%s](<%s>) to **%s**', who, name, link, discord_escape(new.detail));
  elsif new.kind = 'task_created' then
    select assignee into assigned from tasks where id = new.task_id;
    if assigned is not null then
      message := format(E'\U0001F4CC **%s** added [%s](<%s>) for **%s**', who, name, link, discord_escape(assigned));
    end if;
  elsif new.kind = 'note_created' then
    message := format(E'\U0001F4DD **%s** added note [%s](<%s>)', who, note_name, link);
  elsif new.kind = 'note_edited' then
    message := format(E'\U0001F4DD **%s** edited [%s](<%s>)', who, note_name, link);
  elsif new.kind = 'note_moved' then
    message := format(E'\U0001F4DD **%s** moved [%s](<%s>)', who, note_name, link);
  elsif new.kind = 'note_deleted' then
    message := format(E'\U0001F5D1 **%s** deleted note **%s**', who, note_name);
  end if;

  if message is not null then
    perform discord_send(message);
  end if;
  return new;
exception when others then
  -- An alert must never stop someone's save from going through.
  return new;
end;
$$;

drop trigger if exists activity_discord on public.activity;
create trigger activity_discord after insert on public.activity
  for each row execute function public.discord_on_activity();

-- 4. Clean up the 30-minute summary, in case an earlier copy of this file was run ---------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $job$ select cron.unschedule(jobid) from cron.job where jobname = 'hq-note-digest' $job$;
  end if;
end;
$$;
drop function if exists public.discord_note_digest();

-- Sends a test message so you can confirm the webhook works.
create or replace function public.discord_test()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select discord_webhook from hq_settings where id) is null then
    return 'No webhook URL saved yet.';
  end if;
  perform discord_send(E'✅ Briveon HQ is connected to this channel.');
  return 'Test sent. Check your Discord channel.';
end;
$$;

-- Only the SQL Editor and the database itself may use these.
revoke all on function public.discord_escape(text) from public, anon, authenticated;
revoke all on function public.discord_send(text) from public, anon, authenticated;
revoke all on function public.discord_who(uuid) from public, anon, authenticated;
revoke all on function public.discord_on_activity() from public, anon, authenticated;
revoke all on function public.discord_test() from public, anon, authenticated;

-- 5. Connect your channel (run separately) --------------------------------------------------
-- In Discord: channel settings > Integrations > Webhooks > New Webhook > Copy Webhook URL.
-- Then run these two lines with your URL. Keep the URL out of chat and the repo.
--
-- update public.hq_settings set discord_webhook = 'PASTE_WEBHOOK_URL_HERE' where id;
-- select public.discord_test();
--
-- To turn alerts off:
-- update public.hq_settings set discord_webhook = null where id;
