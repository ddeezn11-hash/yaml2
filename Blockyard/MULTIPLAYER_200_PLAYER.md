# Blockyard — 200-player multiplayer target

## What this update changes

The published-game server is configured for up to 200 authenticated players in one in-memory experience session. It was previously capped at 64 (and defaulted to 12).

The server now uses:

- A coarse X/Z spatial grid, built once per snapshot tick.
- A default 220-stud horizontal interest radius.
- A default maximum of 64 nearby remote avatars per browser, chosen by distance.
- 12Hz maximum delta snapshots. Transforms are sent when they change, plus a 1-second refresh for stationary players.
- Explicit hidden-avatar updates when a player moves outside another player's interest radius.
- Snapshot backpressure handling: old movement frames are dropped rather than queued indefinitely; clients that remain badly backed up are disconnected.
- Disabled per-message compression to avoid spending CPU compressing small transform packets.
- Shared immutable geometry/materials for remote R6 avatars, no remote avatar shadows, and a 40-row UI roster display cap.
- A load-test script that simulates 1–200 authenticated WebSocket clients sending 15Hz state updates.

## Important distinction

`GAME_SERVER_MAX_PLAYERS=200` is the maximum number of players in one session on one server process. It does not mean the server was proven to run 200 real browsers smoothly. Real performance depends on the Render instance, browser/device performance, network quality, world complexity, and how many users are in the same area.

Each browser only receives/renders up to 64 nearby remote avatars by default. The full session roster can still count up to 200. This is a deliberate Chromebook-friendly tradeoff. You can increase `GAME_SERVER_MAX_VISIBLE_PLAYERS` up to 128, but this raises browser rendering and bandwidth costs.

The current game server validates client-reported transforms and distributes player positions/chat. It does not run authoritative game physics or synchronize every game-world part/tool interaction. Those are separate features needed for competitive or physics-heavy gameplay.

## Environment variables

| Variable | Default | Allowed range | Purpose |
|---|---:|---:|---|
| `GAME_SERVER_MAX_PLAYERS` | `200` | 2–200 | Players in one shared session |
| `GAME_SERVER_SNAPSHOT_HZ` | `12` | 6–20 | Maximum snapshot tick rate |
| `GAME_SERVER_VIEW_RADIUS` | `220` | 60–1200 | Nearby-player radius in game studs |
| `GAME_SERVER_MAX_VISIBLE_PLAYERS` | `64` | 8–128 | Maximum remote avatars sent to a client |

These are already included in `render.yaml` for `blockyard-game-server`.

## Deploying the update

1. Upload/push this project to the GitHub repository connected to Render.
2. Make sure the `blockyard-game-server` Render service is still a single instance.
3. Trigger a deploy from the latest `main` commit.
4. In Render → `blockyard-game-server` → Environment, verify the four `GAME_SERVER_*` values above.
5. Keep `GAME_ALLOWED_ORIGINS` and `GAME_SERVER_TICKET_SECRET` configured as before.
6. Open the service's `/health` URL. It should report `maxPlayersPerSession: 200`, `snapshotMode: "nearby-delta"`, `maxVisiblePlayersPerClient: 64`, and the current buffered-byte metrics.
7. Upgrade from Free to paid compute before attempting a large load test. The Blueprint deliberately remains on Free to avoid creating a charge without your approval.

Do not add multiple Render instances yet. Session and room state currently live in process memory. Multiple instances need a shared room/session registry and cross-instance message bus (for example Redis) before they can host one shared session.

## Load testing

From `mini-services/game-server`:

```bash
bun install
```

Start a local server in one terminal:

```bash
GAME_SERVER_MAX_PLAYERS=200 \
GAME_SERVER_TICKET_SECRET='YOUR_SECRET' \
bun run start
```

Run simulated tests in another terminal, increasing gradually:

```bash
bun run load-test -- 50
bun run load-test -- 100
bun run load-test -- 150
bun run load-test -- 200
```

For the deployed service, use the Render WebSocket URL and exact website origin:

```bash
LOAD_TEST_URL='wss://YOUR-GAME-SERVER.onrender.com' \
LOAD_TEST_ORIGIN='https://YOUR-WEBSITE.onrender.com' \
GAME_SERVER_TICKET_SECRET='YOUR_SECRET' \
bun run load-test -- 200
```

The test creates signed test tickets using the shared server secret. It does not use real user accounts and does not save test data to Supabase. Start with 20–50 clients on a deployed server and monitor Render CPU, memory, logs and `/health` before increasing the load.

A passing 200-client WebSocket test is only one gate. Also test with real browsers/devices, including the lowest-spec Chromebook you plan to support. Do not advertise a 200-player capacity until both network-server load tests and actual browser frame-rate tests pass.
