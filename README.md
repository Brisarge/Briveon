# Briveon Multimedia

Brighton's portfolio site plus **Briveon HQ**, a private admin area (login + shared task board) for Bris and Rog.

Live at **https://briveon.net** (hosted on Netlify). Plain HTML/CSS/JS with no build step: Netlify serves the files exactly as they are in the repo.

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | Public site |
| `js/content.js` | **Edit this** to change projects, contact links and visualizer tracks |
| `js/visualizer.js` | Neon cube music visualizer (three.js, loaded only when someone presses Play) |
| `assets/` | Images and music |
| `admin/` | Briveon HQ: sign-in, tabs and shared state (`admin.js`), tools in `admin/tools/`, helpers in `admin/lib/` |
| `admin/config.js` | Supabase connection + team names |
| `supabase/schema.sql`, `supabase/002_vault_colors.sql` | Database setup for HQ (run each once, in that order) |
| `tools/pull-vault.ps1` | Downloads a read-only copy of the vault for your AI |
| `tools/serve.ps1` | Local preview server (no Node/Python needed) |
| `netlify.toml` | Netlify deploy settings (copies the public site into `dist/`) |
| `old/` | Old landing page experiments, not linked from the site |

## Preview locally

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open http://localhost:5173. To try HQ without Supabase, open http://localhost:5173/admin/?demo (localhost only, nothing is saved).

## Publish

Push to `main`. Netlify picks up the push and redeploys briveon.net within a minute or so.

`netlify.toml` tells Netlify to copy only the public site files into `dist/` and publish that, so a new top-level page or folder must be added to its list. It overrides the build settings in the Netlify dashboard. If a deploy doesn't show up, check the Netlify dashboard under **Deploys** for a failed build and its log.

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

8. For the vault and color coding: **SQL Editor → New query**, paste all of `supabase/002_vault_colors.sql`, **Run**. Do this before pushing the HQ code that uses it.

How the data stays private: the publishable key is designed to be public, but the database rules in `schema.sql` only let signed-in users whose email is in `admins` read or change tasks. Changes show up live for both of you.

Note: on the free plan Supabase pauses a project after about a week with no activity. If HQ stops loading, open the Supabase dashboard and restore the project.

## The vault and your AIs

Notes live in HQ (`/admin/#vault`). HQ is the main copy, so edit notes there. Each person's Claude reads a local copy of the same vault. It gets read-only access: the token can only read notes, so it can't change HQ.

**One-time setup per person:**

1. In the Supabase **SQL Editor**, run this once for each person and copy the result. It's only shown once:
   ```sql
   select public.create_vault_token('Bris');
   ```
2. Save it as `%USERPROFILE%\.briveon\vault-token.txt` on that person's PC. Never put it in this repo.
3. Pull the vault:
   ```
   powershell -ExecutionPolicy Bypass -File tools\pull-vault.ps1
   ```
   This creates a `BriveonVault` folder in your user folder. Files are marked read-only, and anything changed there gets overwritten on the next pull. The script refuses to write into a folder it didn't create, so it can't touch your original Obsidian vault.
4. Tell Claude about it, for example in `CLAUDE.md`: "Project docs are in `%USERPROFILE%\BriveonVault`. They're read-only. Run `tools\pull-vault.ps1` to refresh them before relying on them."

To cut off a token: `update public.vault_tokens set revoked_at = now() where label = 'Rog';`

**Importing Obsidian:** Vault tab → **Import vault** → pick the vault folder. Notes come across with their folders; images and other non-note files don't yet.

**Deleted notes:** the last copy stays in the `note_versions` table, but restoring one is a database job for now.

## Security cleanup (one-time)

The old `backend/.env` held a YouTube API key and was committed to this public repo. It's deleted on this branch but still visible in the git history, so **delete or regenerate that key** in Google Cloud Console → APIs & Services → Credentials.
