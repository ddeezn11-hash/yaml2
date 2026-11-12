# Blockyard — Supabase Setup Guide (for beginners)

This guide enables **Supabase Auth** for real cloud accounts. Blockyard no longer
falls back to browser-local passwords. Favorites and a few prototype preferences
remain browser-local; published game storage still needs its separate cloud-save
integration.

> Never paste any secret key into chat or email. Secrets live only in
> `.env.local` on your machine and in your hosting provider's dashboard.

---

## Step 1 — Create the Supabase project

1. Open **https://supabase.com** and sign in (or create a free account).
2. Click **New project**.
3. Name it `blockyard`. Pick the region closest to your players.
4. Enter a strong **database password**. Save it somewhere private — this
   password is NOT the API key and you will not paste it anywhere in this app.
5. Click **Create new project** and wait 1–2 minutes for provisioning.

## Step 2 — Copy your URL and publishable key

1. When the project is ready, open it and click **Connect** (top right) or
   open **Project Settings → API Keys**.
2. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **publishable key**. If your dashboard shows a key starting with
   `sb_publishable_...` use that one. (Older dashboards label it the "anon
   public" key.) Do **not** copy a key labeled *secret* or *service_role* into
   any `NEXT_PUBLIC_` variable.

## Step 3 — Put them in your local Blockyard

1. In the Blockyard folder on your computer, make a copy of `.env.example`
   and name it `.env.local`.
2. Fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
   NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:3004
   NEXT_PUBLIC_SYNC_SERVER_URL=ws://localhost:3003
   ```

3. Also generate a multiplayer ticket secret (any long random string):

   ```
   openssl rand -hex 32
   ```

   and put the SAME value in your `.env.local`, the website service, the game
   server, and the Studio sync server:

   ```
   GAME_SERVER_TICKET_SECRET=<the hex string you generated>
   ```

4. `NEXT_PUBLIC_` variables are visible to browsers — that is why only the
   URL and publishable key may carry that prefix.
5. Restart the dev server after changing `.env.local`.

## Step 4 — Configure Authentication

1. In Supabase open **Authentication → URL Configuration**.
2. **Site URL**: `http://localhost:3000` while developing.
3. **Redirect URLs**: add `http://localhost:3000/auth/callback`. When you deploy,
   add `https://blockyard-web.onrender.com/auth/callback**` (the wildcard allows the reset flow's `next` query parameter).
4. Open **Authentication → Providers → Email** and make sure it is enabled.
   - For quick local testing you can leave "Confirm email" OFF.
   - For a real deployment, keep it ON and configure SMTP
     (Authentication → Emails) so verification mail can be delivered.

## Step 5 — Apply the database migration

The schema + security rules are ready in two migrations:

- `supabase/migrations/0001_init.sql` creates the platform tables and storage buckets.
- `supabase/migrations/0002_supabase_auth_hardening.sql` locks profile fields down and adds the authenticated `get_my_profile()` function used by the app.

**Recommended — Dashboard SQL Editor (no terminal needed):**

1. In Supabase open **SQL Editor → New query**.
2. Open `supabase/migrations/0001_init.sql`, copy ALL of it, paste, **Run**.
3. Create a second query, open `supabase/migrations/0002_supabase_auth_hardening.sql`, copy ALL of it, paste, **Run**.
4. Both queries should finish successfully. Do not skip migration 0002: the login and ticket routes require its private `get_my_profile()` RPC.

**Optional — Supabase CLI:**

If you have a Linux/macOS/Windows terminal and have initialized the Supabase CLI project (`npx supabase init`), link your project and apply the migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run --remote
npx supabase db push --remote
```

`YOUR_PROJECT_REF` is the `abcd1234` part of your Project URL. The dashboard option above is easier for the first setup.
## Step 6 — Storage buckets

The migration already creates two buckets:

| Bucket | Public? | Used for |
|---|---|---|
| `experience-files` | private | project snapshots, uploaded assets — only the owner can read/write their own folder |
| `experience-thumbnails` | public | game cover images |

Check them under **Storage** in the dashboard after running the migration.
You don't need to change anything.

## Step 7 — Run the game server (published-game multiplayer)

The multiplayer server is a separate small service:

```bash
cd mini-services/game-server
bun install
GAME_SERVER_TICKET_SECRET=<same value as Step 3> bun run dev
```

It listens on port **3004**. The Studio sync service listens on port **3003**. For local development, install each service's small dependency set and run both in separate terminal tabs. Paste the same secret value used in `.env.local` after the `=` sign:

```bash
# Terminal 1
cd mini-services/game-server
bun install
GAME_SERVER_TICKET_SECRET=PASTE_YOUR_SECRET_HERE bun run dev
```

```bash
# Terminal 2
cd mini-services/studio-sync
bun install
GAME_SERVER_TICKET_SECRET=PASTE_YOUR_SECRET_HERE bun run dev
```

Production uses the Render `wss://` addresses configured on the website. Local development remains in dev mode unless the secret is set on both the app and servers.

Verify: open `http://localhost:3004/health` and `http://localhost:3003/health`. Both should return `{"ok":true,...}`. The game server reports `mode:"ticket-auth"` when the shared secret is set on the app and server.

## Step 8 — Test it

1. `bun run dev` in the project root, open the site.
2. Sign up (a fresh account — old prototype-local accounts are NOT migrated;
   see the note below).
3. Test login/sign-up and confirm the account appears in Supabase Authentication.
4. Test the multiplayer server using a published experience only after its ID and snapshot are backed by cloud rows. The current Studio publish/save flow is still a prototype and is not yet wired to create those rows, so do not assume local drafts are cross-device cloud games.

**Note on old accounts:** passwords were stored in your browser's
localStorage in prototype mode. They were never uploaded anywhere and cannot
be migrated. Create new accounts in cloud mode.

## Step 9 — Deploying for real

1. Follow `DEPLOY_RENDER.md` to create the two WebSocket services from `render.yaml` and the Next.js website as a separate Render Web Service.
2. Put the exact same `GAME_SERVER_TICKET_SECRET` on the website, game server, and Studio sync server. Configure `GAME_ALLOWED_ORIGINS` on both WebSocket services to the exact website origin (no trailing slash).
3. Set `NEXT_PUBLIC_GAME_SERVER_URL=wss://<game-server-host>` and `NEXT_PUBLIC_SYNC_SERVER_URL=wss://<studio-server-host>` on the website before building.
4. In Supabase **Authentication → URL Configuration**, add the production Site URL and Redirect URL.
5. One game-server instance holds sessions in memory. Before scaling to multiple instances, add shared session storage/coordination (for example Redis).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid API key` | URL and key must come from the SAME project; check for stray spaces; restart dev server |
| Login redirects back to the login page | Add your exact site URL under Authentication → URL Configuration → Redirect URLs |
| `relation "profiles" does not exist` / RLS `permission denied` | The migration didn't run — redo Step 5 |
| `ONLINE` badge never appears / "Can't reach the game server" | The game server isn't running or `GAME_SERVER_TICKET_SECRET` differs between app and server |
| `mode: "dev"` on /health | No secret set — local development only; production Docker containers reject unsigned connections |

## Checklist of values you had to fill in

- [ ] `NEXT_PUBLIC_SUPABASE_URL` (from dashboard)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from dashboard)
- [ ] `GAME_SERVER_TICKET_SECRET` (same in website + both multiplayer services)
- [ ] `GAME_ALLOWED_ORIGINS` (exact production website origin on both multiplayer services)
- [ ] Database password (private, never in the app)


## Step 10 — Create your first administrator safely

There is no public `admin/admin1234` account anymore. Register your own account
normally, verify its email, and sign in once so the profile row is created.
Then open Supabase → **SQL Editor** and run this query, replacing the username
with your own exact Blockyard username:

```sql
update public.profiles
set is_admin = true
where username = 'YOUR_USERNAME';
```

Sign out and sign back in. The application reads the administrator flag through
`get_my_profile()`; it is not writable from the browser. Do not grant admin to
other users unless you intend to give them moderation access.

## Step 11 — Required environment variables

Set these on the Next.js website service:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
GAME_SERVER_TICKET_SECRET=YOUR_RANDOM_64_CHARACTER_HEX_SECRET
NEXT_PUBLIC_GAME_SERVER_URL=wss://YOUR-GAME-SERVER.onrender.com
NEXT_PUBLIC_SYNC_SERVER_URL=wss://YOUR-STUDIO-SERVER.onrender.com
```

Set `GAME_SERVER_TICKET_SECRET` to the exact same random value on the website,
`blockyard-game-server`, and `blockyard-studio-sync` on Render. Never prefix it
with `NEXT_PUBLIC_` and never commit it to GitHub. Set `GAME_ALLOWED_ORIGINS`
on both WebSocket services to the website's exact origin. Production rejects
WebSocket connections if that allow-list is empty or does not match. Both WebSocket services reject
unsigned identity/role packets in production.

## Important current limits

- Supabase Auth now owns account passwords and sessions. It does not migrate
  old local accounts.
- Player preferences and prototype platform lists are still stored locally;
  published games and saves are not yet fully wired to the Supabase tables.
- Secure Team Create tickets work only for project IDs that are actual UUIDs in
  `public.experiences` and have an owner/collaborator row. The current local
  Studio project IDs are not cloud IDs, so local Team Create sessions must be
  published/saved to cloud before production cross-device collaboration works.
- The admin page verifies the database admin flag, but cloud-wide user
  moderation actions still need a server-side moderation API. Use Supabase
  Dashboard for moderation until that API is implemented.


Password recovery uses Supabase Auth. The sign-in page can email a reset link; Supabase redirects to `/auth/callback`, exchanges the one-time code, and opens `/reset-password` so the player can choose a new password.
