# Deploy Blockyard to Render

This guide assumes the project has been extracted and pushed to a GitHub repository with `render.yaml` at the repository root. Keep `.env`, `.env.local`, database passwords, Supabase secret keys, and the HMAC ticket secret out of GitHub.

## What gets deployed

| Render service | Purpose |
|---|---|
| `blockyard-web` | Next.js website and authentication API (create in the dashboard) |
| `blockyard-game-server` | Published-game multiplayer WebSocket server |
| `blockyard-studio-sync` | Team Create synchronization WebSocket server |

The Blueprint in `render.yaml` creates the two WebSocket servers. The website is created separately so you can obtain its exact URL before restricting the multiplayer servers to that origin.

The published-game server is configured for a **200-player session target**. It uses spatial interest management (220-stud radius), delta transform updates (12Hz ceiling), and a 64-nearby-avatar cap per browser. The cap is intentional: 200 remote 3D characters on every low-end Chromebook would likely make the browser itself the bottleneck. Players still share one session and the online roster counts the full session; each client renders the nearest visible players.

## Before you start

1. Create the Supabase project and apply both SQL migrations in `supabase/migrations/` in order. Follow `SUPABASE_SETUP.md`.
2. Push this repository to GitHub. `render.yaml` and `package.json` must be at the repository root.
3. Generate one strong shared ticket secret. In a terminal run:

   ```bash
   openssl rand -hex 32
   ```

   Save the value privately. You will enter the exact same value in the website and both multiplayer services. Do not add `NEXT_PUBLIC_` to this variable.

## Step 1 — Create the Next.js website service

1. Open https://dashboard.render.com/ and connect your GitHub account.
2. Choose **New + → Web Service** and select your Blockyard repository.
3. Set:
   - Name: `blockyard-web`
   - Branch: `main`
   - Root Directory: leave blank
   - Runtime: Node (Render's JavaScript runtime supports Bun commands)
   - Plan: Free for initial testing
   - Build Command: `bun install --frozen-lockfile && bun run build`
   - Start Command: `bun run start`
4. Do not choose Static Site. This is a Next.js application with server-side routes.
5. Under **Environment**, add:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   GAME_SERVER_TICKET_SECRET=YOUR_RANDOM_64_CHARACTER_HEX_SECRET
   ```

   Use the URL and publishable key from the same Supabase project. Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.
6. Click **Create Web Service**. Copy the exact website URL Render assigns, for example `https://blockyard-web.onrender.com`.

The site can deploy before the WebSocket URLs are set. Multiplayer won't connect until Step 3, which is expected.

## Step 2 — Set the Supabase redirect URLs

In Supabase open **Authentication → URL Configuration**:

- Site URL: your actual website address, e.g. `https://blockyard-web.onrender.com`
- Redirect URLs: add `https://blockyard-web.onrender.com/auth/callback**`
- Keep `http://localhost:3000/auth/callback**` for local testing if needed.

For public sign-ups, enable email confirmation and configure custom SMTP. Supabase's default email sender is restricted to project-team addresses and currently allows only 2 messages per hour; it is for testing, not a school-wide rollout.

## Step 3 — Create the two multiplayer services

1. In Render choose **New + → Blueprint**.
2. Select the same GitHub repository and `main` branch. Render reads the root `render.yaml` and should detect `blockyard-game-server` and `blockyard-studio-sync`.
3. Fill the prompted variables on **both** services:
   - `GAME_ALLOWED_ORIGINS`: paste the exact website origin from Step 1, e.g. `https://blockyard-web.onrender.com`. No trailing slash. If you later attach a custom domain, add that exact origin too.
   - `GAME_SERVER_TICKET_SECRET`: paste the same random secret already used on `blockyard-web`. Enter it exactly on both multiplayer services.
4. Click **Apply** and watch each service's Events and Logs until deployment succeeds.

Production deliberately fails closed: if the origin list is empty, missing, or does not include the browser website's exact origin, WebSocket connections are rejected. Do not use `*`.

Copy the public HTTPS addresses Render assigns to both services, for example:

```text
https://blockyard-game-server-xxxx.onrender.com
https://blockyard-studio-sync-xxxx.onrender.com
```

Their browser WebSocket addresses use `wss://`:

```text
wss://blockyard-game-server-xxxx.onrender.com
wss://blockyard-studio-sync-xxxx.onrender.com
```

## Step 4 — Connect the website to the multiplayer services

1. Return to the `blockyard-web` service in Render.
2. Open **Environment** and add:

   ```text
   NEXT_PUBLIC_GAME_SERVER_URL=wss://YOUR-GAME-SERVER.onrender.com
   NEXT_PUBLIC_SYNC_SERVER_URL=wss://YOUR-STUDIO-SERVER.onrender.com
   ```

3. Save and trigger a new deploy. `NEXT_PUBLIC_*` values are compiled into the browser bundle at build time; changing them later requires another build.
4. Verify that `GAME_ALLOWED_ORIGINS` on both multiplayer services still exactly matches the website's origin.

## Step 5 — Test the services

Open these in a browser, replacing the hostnames:

```text
https://YOUR-GAME-SERVER.onrender.com/health
https://YOUR-STUDIO-SERVER.onrender.com/health
```

Both should return JSON with `"ok": true`. The game server should show `"mode":"ticket-auth"` after the shared secret is configured.

Then test:

1. Open the website and create an account using an email address you can access.
2. Open the confirmation email link. It should return to `/auth/callback` and complete sign-in.
3. Test Forgot password and use the emailed link to open `/reset-password`.
4. Once the cloud publishing flow creates a cloud `experiences` row, join the same experience from two browser windows and inspect the game-server Logs.

## Current limitations — read before inviting classmates

- The old public `admin/admin1234` demo account and browser-local password store have been removed. Existing prototype accounts cannot be migrated because their passwords were only stored in the old browser's local storage. Users must create new Supabase accounts.
- The database schema is prepared, and Supabase Auth backs sign-up, sign-in, email confirmation and password reset. The entire game publishing/save/discover pipeline is **not yet fully connected** to the Supabase tables. Local project lists and some preferences are still browser-local.
- Local development may use local demo experience IDs. Production game tickets require an actual cloud `experiences` UUID visible to the user under Supabase RLS. Secure production Team Create also requires a cloud project row plus an owner/collaborator permission. The app's cloud publish/save UI is a remaining integration step, so do not assume local drafts are cross-device cloud games.
- Admin promotion can be performed through Supabase SQL as documented in `SUPABASE_SETUP.md`, but cloud-wide user moderation actions are not yet implemented in the app.
- Both multiplayer servers keep active sessions/rooms in memory. A restart, deploy, or free-tier spin-down disconnects players and clears live rooms. Multi-instance scaling needs shared storage/session coordination such as Redis.
- Free Render services can spin down after 15 minutes without inbound HTTP requests or WebSocket messages. The first connection after sleep takes about a minute, so free instances are for testing rather than always-on school-wide use.

## Common problems

| Problem | Fix |
|---|---|
| WebSocket closes with code `4003` | Ensure `GAME_ALLOWED_ORIGINS` contains the exact site origin on that server: scheme + host + optional port, no trailing slash. |
| `Invalid or expired ticket` | The HMAC secret differs between the web app and WebSocket service, or the ticket expired before use. Paste the same secret into all three services. |
| Health check fails | Open Render Logs and look for startup/dependency errors. |
| Login says Supabase isn't configured | Check both Supabase website env vars and redeploy the website. |
| Changed server URL but client still uses old URL | Rebuild/redeploy the Next.js website; `NEXT_PUBLIC_*` is build-time. |
| `This game has not been published to cloud storage yet` | The game still has a local demo ID; the cloud publishing integration has not created an `experiences` row for it. |


## Step 6 — Prepare and load-test the 200-player game server

The game-server Blueprint defaults are:

| Setting | Default | Meaning |
|---|---:|---|
| `GAME_SERVER_MAX_PLAYERS` | `200` | Maximum players in one shared session |
| `GAME_SERVER_SNAPSHOT_HZ` | `12` | Maximum nearby transform replication rate |
| `GAME_SERVER_VIEW_RADIUS` | `220` | Horizontal radius for remote avatars, in game studs |
| `GAME_SERVER_MAX_VISIBLE_PLAYERS` | `64` | Maximum remote avatars rendered by one browser |

The server now builds a spatial grid per snapshot tick, sends only nearby players, sends changed transforms instead of the full roster every tick, skips replaceable movement frames when a socket is backed up, and disconnects clients whose network buffers grow too large. Remote avatars share immutable mesh geometry/materials and do not cast shadows; the in-game player list is also capped visually so it does not create hundreds of DOM rows.

### Upgrade the game-server compute before inviting 200 people

The Blueprint remains on Render's Free plan to avoid silently opting you into a charge. Render currently lists Free web services at 512MB RAM / 0.1 CPU and says Free services are for testing, not production. Its current pricing page lists a 1 CPU / 2GB instance at $25/month; this is a sensible first paid size to benchmark, not a promise that it will handle 200 players. In the Render dashboard, open **blockyard-game-server → Settings → Instance Type** and select a paid instance based on the measured CPU, memory and socket-buffer metrics. Keep this as a single instance for now: active game sessions live in process memory, so horizontally scaling to multiple instances before adding a shared room/connection layer (such as Redis) would split players across separate in-memory session registries. A restart still disconnects the session.

### Run a simulated 200-connection test

First test a local server. Open a terminal:

```bash
cd mini-services/game-server
bun install
GAME_SERVER_MAX_PLAYERS=200 GAME_SERVER_TICKET_SECRET='YOUR_SECRET' bun run start
```

Open a second terminal in the same folder:

```bash
bun run load-test -- 50
```

Then increase gradually:

```bash
bun run load-test -- 100
bun run load-test -- 150
bun run load-test -- 200
```

For the deployed Render server, run the load test from a separate computer or Linux machine, not from the same Render service. Set the exact website origin and same HMAC secret:

```bash
LOAD_TEST_URL='wss://YOUR-GAME-SERVER.onrender.com' \
LOAD_TEST_ORIGIN='https://YOUR-WEBSITE.onrender.com' \
GAME_SERVER_TICKET_SECRET='YOUR_SECRET' \
 bun run load-test -- 200
```

The test simulates 200 authenticated sockets and 15Hz movement messages for 30 seconds, then reports successful connections, disconnected clients, snapshot/transform counts, queued socket data and `/health` metrics. Do not run a large test against a free service repeatedly; begin with 20–50 clients and watch Render CPU, memory and logs.

**What the test does not prove:** It does not open 200 real browser tabs, render 200 separate Three.js scenes, test your school's network, or test collision/game scripts. It measures the WebSocket server under simulated traffic. Only advertise 200-player capacity after the deployed service passes this test at peak load and a separate real-browser test confirms acceptable frame rates on your target Chromebook. The server still validates client-reported transforms rather than simulating authoritative physics, and sessions are currently in-memory.
