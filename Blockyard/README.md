# Blockyard

Blockyard is a browser-based game creation and multiplayer platform.

## Project contents

- `src/` — Next.js website, Studio UI, game client, and application logic.
- `mini-services/game-server/` — published-game multiplayer WebSocket service.
- `mini-services/studio-sync/` — Team Create synchronization WebSocket service.
- `supabase/` — Supabase SQL migrations, row-level-security tests, and cloud account profile functions.
- `render.yaml` — Render Blueprint for the two multiplayer services. Create the Next.js website as a separate Render Web Service.
- `SUPABASE_SETUP.md` — Supabase setup notes.
- `DEPLOY_RENDER.md` — Render deployment instructions.
- `MULTIPLAYER_200_PLAYER.md` — 200-player networking design, tuning variables, and load-test instructions.
- Studio Explorer includes a visible, expandable `StarterPack` service; tools added through Toolbox → Gear or Tool Creator appear beneath it and are copied into player Backpacks on spawn.
- `prisma/` and `db/` — local SQLite/Prisma development schema and database directory.

## Local setup

1. Install Bun.
2. Copy `.env.example` to `.env`.
3. Fill in the required local environment values.
4. Run `bun install`.
5. Run `bun run dev`.

The local SQLite database file is intentionally not included. It can be generated from the Prisma schema using the project's database scripts. Supabase Auth owns account credentials and sessions. The Supabase platform tables are a separate schema from the local Prisma SQLite schema; publishing games/saves to those cloud tables is not yet fully integrated.

## GitHub upload warning

Extract this ZIP before adding the project to a GitHub repository. Do **not** upload this ZIP as the only repository file; GitHub and Render need the project files and folders extracted at the repository root.

The archive intentionally excludes the old `.git` history, `.env`, local SQLite database, and runtime PID file. This avoids publishing local credentials, local machine state, or old commits. `.env.example` contains placeholders only.

## Deployment guides

Read `SUPABASE_SETUP.md`, `DEPLOY_RENDER.md`, and `MULTIPLAYER_200_PLAYER.md` before deploying. Run migrations `0001_init.sql` and `0002_supabase_auth_hardening.sql` in that order. Deploy the two WebSocket servers from `render.yaml`, then create the Next.js website as a separate Render Web Service. Set the same private `GAME_SERVER_TICKET_SECRET` on the website and both multiplayer services, and configure `GAME_ALLOWED_ORIGINS` on both servers. Keep private secrets out of GitHub.

## Security status

- Supabase Auth replaces the old plaintext browser account/password store. The updated app deletes the legacy local account key on startup and includes the email-confirmation PKCE callback and password-reset flow.
- The public `admin/admin1234` demo login has been removed. Promote the first admin through the Supabase SQL Editor as described in `SUPABASE_SETUP.md`.
- Multiplayer identity and Studio roles are signed by the server-side API after Supabase session/permission checks; production WebSocket services fail closed unless their allowed-origin list is configured.
- Local preferences, prototype game listings and the publish/save pipeline are not yet fully cloud-backed. Secure cross-device Team Create requires a cloud `experiences` row and collaborator permissions.

## Studio UI and Live Team Testing

See [`STUDIO_UI_AND_LIVE_TESTING.md`](./STUDIO_UI_AND_LIVE_TESTING.md) for the UI Editor, Script toolbar, Test Here/Run controls, shared Team Create test server, live edit synchronization, editable Baseplate, and camera controls.
