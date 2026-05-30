# Deployment — Arisa v1 (single host)

The backend serves the built frontend, so the whole app runs as **one Node
process on one origin**.

## Render (one service)

The repo root has `build`/`start` scripts and a `render.yaml` Blueprint, so the
whole single-host app runs as one Render web service. In the web-service form:

| Field | Value |
|---|---|
| Language | Node |
| Root Directory | *(leave blank — repo root)* |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Branch | `master` |

This project uses **npm**, not yarn — change the prefilled `yarn` / `yarn start`.

Set these env vars in the Render dashboard:
- `XAI_API_KEY` — your key (secret).
- `CLIENT_ORIGIN` — this service's URL, e.g. `https://arisa.onrender.com` (CORS +
  WS origin check). Set it after the first deploy gives you the URL.
- `TRUST_PROXY=1`, `NODE_VERSION=22` (also in `.nvmrc` / Blueprint).
- Optional: `TTS_PROVIDER`, `STT_PROVIDER`, `XAI_TTS_VOICE`, `RATE_LIMIT_*`.
- Do **not** set `PORT` — Render injects it.

Render serves HTTPS automatically (needed for the iOS mic) and supports the
WebSocket (`/api/transcribe`). Health check path: `/api/health`.

Caveats: the SQLite memory file is **ephemeral** on Render (resets on deploy/
restart; free instances also sleep when idle) — add a paid disk and set
`DATABASE_PATH` to persist it (see `render.yaml`). `better-sqlite3` is rebuilt
during the build for Render's Linux/Node.

## Build (manual / other hosts)

```bash
# 1. Build the frontend (outputs web/dist)
cd web && npm ci && npm run build

# 2. Build the backend (outputs backend/dist)
cd ../backend && npm ci && npm run build
```

> `better-sqlite3` is a native module — run `npm ci`/`npm install` on the
> deploy target (or matching Node version), or it will fail to load.

## Run

```bash
cd backend && npm start        # node dist/index.js
```

The server auto-detects `../web/dist` and serves it (SPA fallback included).
Override the location with `STATIC_DIR` if your layout differs.

## Required env (`backend/.env`)

| Var | Notes |
|---|---|
| `PORT` | Listen port (PaaS usually injects this). |
| `XAI_API_KEY` | Required (LLM + default TTS/STT). |
| `XAI_TTS_VOICE` | Default `Eve`. |
| `TTS_PROVIDER` / `STT_PROVIDER` | `xai` (default) or `elevenlabs`. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Only if using the ElevenLabs fallback. |
| `CLIENT_ORIGIN` | Your public URL, e.g. `https://arisa.example.com`. Used for CORS and the WS origin check. On single host this is your own domain. |
| `TRUST_PROXY` | `1` behind one reverse proxy / PaaS load balancer (correct client IP for rate limiting); `0` if exposed directly. |
| `DATABASE_PATH` | SQLite file path; use a persistent volume in prod. |
| `RATE_LIMIT_PER_MIN` / `RATE_LIMIT_PER_DAY` | Per-IP caps on `/api/chat`. Defaults `10` / `100`. |

The frontend needs **no** runtime env on single host: with `VITE_API_URL` /
`VITE_WS_URL` unset (they live in `web/.env.development`, not loaded by
`vite build`), it calls the same origin it's served from (`/api/` and same-host
`wss://`). Keep `VITE_DEBUG=false`.

## Rate limiting

`POST /api/chat` (STT → LLM → TTS, the token-spending path) is limited per
client IP: `RATE_LIMIT_PER_MIN` requests/minute and `RATE_LIMIT_PER_DAY`/day.
Over the limit returns HTTP 429 with a JSON `error`. Tune via env.

## Behind a reverse proxy (nginx)

Proxy HTTP **and** WebSocket upgrades to the Node port; set `TRUST_PROXY=1`.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;        # WS upgrade for /api/transcribe
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Mobile / iOS Safari

- **HTTPS is required.** iOS Safari (and Chrome) only expose the microphone
  (`getUserMedia`) in a secure context. The app must be served over `https://`
  (or `localhost`) or the mic button errors out. Terminate TLS at your reverse
  proxy / PaaS.
- iOS ignores the requested 16kHz capture rate and records at the hardware rate
  (usually 48kHz). The client reports its real rate per audio chunk and the STT
  proxy mirrors it to xAI, so transcription works regardless — no config needed.
- TTS audio and the mic are unlocked from the first tap (mic/send button). This
  needs a real user gesture, which those buttons provide.

## Health check

`GET /api/health` → `{ "status": "ok" }`.
