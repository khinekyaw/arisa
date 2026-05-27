# Arisa

A real-time voice AI avatar. Speak or type to Arisa — a 3D VRM character who listens, thinks, and responds with lip-synced speech and expressive animations.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Three.js, @react-three/fiber, @pixiv/three-vrm |
| Backend | Node.js, Express 5, TypeScript |
| Speech-to-Text | ElevenLabs Scribe (batch) + Scribe v2 Realtime (live, WebSocket) |
| LLM | xAI Grok |
| Text-to-Speech | ElevenLabs TTS |
| Lip-sync | `wawa-lipsync` (real-time) |
| State | Zustand |

## Prerequisites

- Node.js 18+
- [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) CLI available on `$PATH` (used for viseme generation)
- ElevenLabs API key
- xAI API key

## Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your API keys
npm run dev            # runs on http://localhost:3001
```

**`backend/.env`**
```
PORT=3001
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...          # optional — defaults to Bella
ELEVENLABS_STT_MODEL_ID=...      # optional — defaults to scribe_v2_realtime
XAI_API_KEY=...
CLIENT_ORIGIN=http://localhost:5173   # optional — allowed WebSocket origin
```

### Frontend

```bash
cd web
npm install
cp .env.example .env   # or edit directly
npm run dev            # runs on http://localhost:5173
```

**`web/.env`**
```
VITE_DEBUG=false
VITE_API_URL=http://localhost:3001/api/
VITE_WS_URL=ws://localhost:3001/api/transcribe
```

Place your VRM avatar at `web/public/models/AvatarSample_M.vrm` and Mixamo FBX animations under `web/public/animations/`.

## Architecture

Voice turns are transcribed live over a WebSocket (shown as a "listening" bubble);
on stop, the final transcript is sent as text to `/api/chat` for the spoken reply.

```
User speaking ──PCM over ws──▶ /api/transcribe ──▶ ElevenLabs Scribe v2 Realtime
    │                              proxy            │
    │         live partial / committed transcript ◀─┘
    ▼
Chat.tsx  ──POST /api/chat──▶  voiceRoute.ts
   (text)
                                   │
                          ┌────────┤
                          │  STT   │ (audio only) ElevenLabs Scribe
                          │  LLM   │ xAI Grok  →  text + <avatar> JSON
                          │  TTS   │ ElevenLabs  →  mp3 base64
                          └────────┤
                                   │
                     ◀─── JSON response ───────
                          { transcript, message,
                            audio_base64, animation,
                            expression, visemes }
                                   │
                             avatarStore (Zustand)
                          ┌────────┴────────┐
                    useVRMLipSync      useVRMAnimations
                    useVRMExpressions  useVRMBlink
                    useVRMLookAt
```

## Scripts

```bash
# Frontend
npm run dev       # dev server
npm run build     # production build
npm run lint      # ESLint

# Backend
npm run dev       # nodemon dev server
npm run build     # tsc compile
npm run start     # run compiled dist/
```
