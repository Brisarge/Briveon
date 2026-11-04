# Briveon Multimedia

Brighton's portfolio site plus **Briveon HQ**, a private admin area (login + shared task board) for Bris and Rog.

Live at **https://briveon.net** (hosted on Netlify). Plain HTML/CSS/JS with no build step: Netlify serves the files exactly as they are in the repo.

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | Public site |
| `js/content.js` | **Edit this** to change projects, contact links and visualizer tracks |
| `js/visualizer.js` | Neon cube music visualizer (three.js, loaded only when someone presses Play) |
| `assets/` | Images and music |
| `admin/` | Briveon HQ: sign-in page and task board |
| `admin/config.js` | Supabase connection + team names |
| `supabase/schema.sql` | Database setup for HQ (run once) |
| `tools/serve.ps1` | Local preview server (no Node/Python needed) |
| `netlify.toml` | Netlify deploy settings (no build, serve the repo root) |
| `old/` | Old landing page experiments, not linked from the site |

## Preview locally

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open http://localhost:5173. To try HQ without Supabase, open http://localhost:5173/admin/?demo (localhost only, nothing is saved).

## Publish

Push to `main`. Netlify picks up the push and redeploys briveon.net within a minute or so.

`netlify.toml` tells Netlify there's no build step and to serve the repo root. It overrides the build settings in the Netlify dashboard. If a deploy doesn't show up, check the Netlify dashboard under **Deploys** for a failed build and its log.

## Admin setup (Supabase, free)

1. Create a free account at https://supabase.com and a **New project** (e.g. `briveon-hq`). Save the database password somewhere safe.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, **Run**.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up", so nobody else can make an account.
4. **Authentication → Users → Add user → Create new user**: your email + password, with "Auto Confirm User" ticked. Do the same for Rog.
5. Back in the **SQL Editor**, add both emails to the admin list:
   ```sql
   insert into public.admins (email) values ('you@example.com'), ('rog@example.com');
   ```
6. Copy the **Project URL** (Project Settings → Data API) and the **publishable key** (Project Settings → API Keys; older projects call it the "anon public" key) into `admin/config.js`. Never use the secret / `service_role` key.
7. Push, open https://briveon.net/admin/, sign in.

How the data stays private: the publishable key is designed to be public, but the database rules in `schema.sql` only let signed-in users whose email is in `admins` read or change tasks. Changes show up live for both of you.

Note: on the free plan Supabase pauses a project after about a week with no activity. If HQ stops loading, open the Supabase dashboard and restore the project.

## Security cleanup (one-time)

The old `backend/.env` held a YouTube API key and was committed to this public repo. It's deleted on this branch but still visible in the git history, so **delete or regenerate that key** in Google Cloud Console → APIs & Services → Credentials.
