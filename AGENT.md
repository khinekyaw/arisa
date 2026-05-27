# Agent Guide — Arisa v1

This document is for AI agents and automated tools working on this codebase.

## Project Structure

```
v1/
├── web/               React + Three.js frontend (Vite, port 5173)
│   └── src/
│       ├── components/
│       │   ├── Avatar.tsx       VRM model loader + entry animation
│       │   ├── Scene.tsx        Three.js scene setup
│       │   └── Chat.tsx         Voice/text input UI + API client
│       ├── hooks/
│       │   ├── useVRMAnimations.tsx          Mixamo→VRM animation playback
│       │   ├── useVRMBlink.tsx               Randomised eye blink
│       │   ├── useVRMExpressions.tsx         Facial expression lerp
│       │   ├── useVRMLipSync.ts              Real-time lip sync + audio playback
│       │   ├── useVRMLookAt.tsx              Camera-tracking eye gaze
│       │   └── useStreamingTranscription.ts  Live mic → PCM → WS → transcript
│       ├── store/
│       │   └── avatarStore.ts    Zustand — central avatar state
│       └── utils/
│           ├── remapMixamoAnimationToVrm.ts
│           └── mixamoVRMRigMap.ts
└── backend/           Express API (port 3001)
    └── src/
        ├── index.ts             Server entry, CORS, HTTP + WS server
        ├── routes/
        │   └── voiceRoute.ts    POST /api/chat pipeline
        ├── ws/
        │   └── transcribeSocket.ts   WS proxy → ElevenLabs realtime STT
        ├── db/
        │   └── index.ts          SQLite connection + schema (better-sqlite3)
        ├── services/
        │   └── history.ts        Session + message persistence
        └── mock/
            └── data.ts          Static test fixture for /api/chat/test
```

## Data Flow

`POST /api/chat` accepts either:
- `multipart/form-data` with an `audio` field (Blob) → STT → LLM → TTS
- `application/json` or form with a `text` field → LLM → TTS

Response shape:
```ts
{
  session_id: string
  transcript: string          // user's words
  message: string             // Arisa's reply (plain text)
  audio_base64: string        // mp3 as base64
  audio_mime: "audio/mpeg"
  animation: AnimationName    // e.g. "talk", "wave", "dance"
  expression: {               // VRM expression weights 0–1
    happy: number
    sad: number
    angry: number
    relaxed: number
    surprised: number
  }
}
```

## Live Transcription (WebSocket + VAD)

Voice input is hands-free, like a typical assistant. Clicking the mic *arms*
listening; transcription only starts once the user actually speaks, and the turn
auto-sends after they stop.

```
Mic → AudioContext (16kHz PCM) → ws://…/api/transcribe (backend proxy)
                                      │  adds xi-api-key, forwards
                                      ▼
                          ElevenLabs Scribe v2 Realtime
                                      │
        partial_transcript ──────────┤  (live, updates the bubble)
        committed_transcript ────────┘  (final segment)
```

**Phase machine** (`useStreamingTranscription.ts`, client-side VAD):

| Phase | Behavior |
|---|---|
| `armed` | Mic + WS open. Audio is buffered, **not sent**. Watching RMS energy for speech onset. Bubble shows "Listening…". Auto-cancels after `armTimeoutMs` (12s) of no speech. |
| `speaking` | Onset confirmed (`minVoicedFrames` voiced frames). Pre-buffer is flushed so the first word isn't clipped, then frames stream live. Bubble shows the running transcript. |
| → `idle` | Trailing silence ≥ `silenceMs` (1.2s) ends the turn automatically. |

- **VAD** is pure client-side: RMS energy is computed on the PCM frames already
  captured, so no extra library. Thresholds (`speechThreshold`, `silenceThreshold`,
  `silenceMs`) are hook options; defaults live in `DEFAULTS`.
- **Auto-send**: on turn end the hook calls `onTurnEnd(transcript)`. `Chat.tsx`
  passes `sendText`, which POSTs the text to `/api/chat` — skipping batch STT
  (no redundant transcription, lower cost).
- **Backend**: `ws/transcribeSocket.ts` is a thin proxy. It opens an upstream WS
  to ElevenLabs with the `xi-api-key` header (the key never reaches the browser)
  and pipes messages both ways. Origin is checked against `CLIENT_ORIGIN`.

### Continuous conversation loop & anti-feedback

The mic button toggles **conversation mode** (`convoActive` in `Chat.tsx`), not a
single turn. The loop runs hands-free until toggled off:

```
arm → speak → (VAD silence) → auto-send → avatar replies (TTS plays) → re-arm → …
```

The re-arm is gated by a single effect that only fires `start()` when **all** of:
`convoActive && phase === "idle" && !pendingReply && !isAudioPlaying`.

- `pendingReply` covers the "thinking" gap (sent, awaiting reply). Cleared when
  the avatar's audio starts, with a `REPLY_FALLBACK_MS` safety net for replies
  with no audio.
- `isAudioPlaying` (from `avatarStore`) covers the "speaking" phase. **This is the
  anti-feedback guard**: the mic is never armed while the avatar is talking, and
  between turns the audio graph is fully torn down — so TTS output can never be
  captured and transcribed as user speech.
- Errors (e.g. mic permission denied) flip `convoActive` off to avoid a retry storm.

Barge-in (interrupting the avatar mid-reply) is intentionally **not** supported —
it requires reliable acoustic echo cancellation against loudspeaker TTS and risks
feedback. Add it later by keeping capture alive during playback behind AEC.

The model is `scribe_v2_realtime` (override via `ELEVENLABS_STT_MODEL_ID`).
Audio is PCM at the AudioContext sample rate (requested 16kHz; the actual rate
is read back and sent per-chunk, so any supported rate works without resampling).

## Conversation Memory (SQLite)

History is persisted with `better-sqlite3` (single file, no external service).

- **Schema** (`db/index.ts`): `sessions(id, created_at, updated_at)` and
  `messages(id, session_id, role, content, created_at)`, FK cascade on delete.
- **Service** (`services/history.ts`):
  - `ensureSession(id?)` — returns the id, creating the row if missing.
  - `getHistory(id, limit = 20)` — last N messages, chronological. **Sliding
    window**: the full history stays in SQLite, but only the tail is fed to the
    model (`DEFAULT_HISTORY_LIMIT`).
  - `appendTurn(id, user, assistant)` — writes both messages in one transaction.
- **Flow**: `POST /api/chat` calls `ensureSession(req.body.session_id)`, passes the
  recent window to `askGrok`, then `appendTurn`. The `session_id` is returned in
  the response; the frontend persists it in `localStorage` (`arisa_session_id`)
  and sends it on every request, so memory survives reloads.
- **DB path**: `DATABASE_PATH` env (default `data/arisa.db`). Gitignored.

This is a deliberate window-only design — no summarization or vector search yet.
Add rolling summarization first if sessions grow long (see git history / prior
discussion); vector search only if durable cross-session recall is needed.

## Avatar State (Zustand)

`avatarStore.ts` is the single source of truth for avatar playback:

| Field | Purpose |
|---|---|
| `values` | Latest API response payload |
| `isAudioPlaying` | True while TTS audio is playing |
| `isAnimationPlaying` | True while a one-shot animation runs |
| `isIdle` | True when both above are false |

When `isIdle` becomes true, `clearValues()` is called automatically — hooks that read `values` should handle `null`.

## VRM Hooks

All hooks live in `web/src/hooks/` and are consumed exclusively by `Avatar.tsx`.

- **useVRMLipSync** — plays base64 audio, drives mouth shapes via `wawa-lipsync` visemes on every `useFrame`.
- **useVRMAnimations** — loads 11 Mixamo FBX clips, remaps to VRM bones. One-shot animations (from `avatarState.animation`) use `LoopOnce`. Idle loop plays when not animating.
- **useVRMExpressions** — lerps VRM expression weights toward target values from `avatarState.expression`. Falls back to Leva debug controls when no state is active.
- **useVRMBlink** — randomised blink timer, independent of other systems.
- **useVRMLookAt** — makes eyes track the camera position, clamped to ±0.8 units.

## Adding a New Animation

1. Add the FBX to `web/public/animations/`.
2. Add an entry to the `ANIMATIONS` array in `useVRMAnimations.tsx`.
3. Add a new `useFBX(...)` call in `useAllFBX()` and include it in the returned array (hooks must not be conditional or in loops).
4. Update the `AnimationName` type in `voiceRoute.ts` to include the new name.
5. Update the LLM system prompt in `voiceRoute.ts` to describe when to use it.

## Adding a New API Endpoint

Add a new `router.post(...)` in `backend/src/routes/voiceRoute.ts` or create a new route file and mount it in `backend/src/index.ts`.

## Key Constraints

- FBX hooks (`useFBX`) must all be called unconditionally at the top of `useAllFBX` — no dynamic hook calls.
- `useFrame` callbacks run on every render tick (~60fps). Keep them lean.
- The VRM `expressionManager` is shared across all hooks — lerp, never hard-set, to avoid conflicts between blink/lip-sync/expressions.
- Session history is stored in-memory in `voiceRoute.ts`; it resets on server restart.
- Rhubarb is called via shell exec in `getVisemesFromAudio`; it must be on `$PATH` for viseme generation to work (currently unused in the live pipeline, served separately if needed).

## Environment Variables

**Backend (`backend/.env`)**
- `PORT` — HTTP port (default 3000, dev uses 3001)
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID` — defaults to Bella (`hpp4J3VqNfWAUOO0d1Us`)
- `ELEVENLABS_STT_MODEL_ID` — realtime STT model (default `scribe_v2_realtime`)
- `XAI_API_KEY`
- `CLIENT_ORIGIN` — allowed WS origin (default `http://localhost:5173`)
- `DATABASE_PATH` — SQLite file path (default `data/arisa.db`)

**Frontend (`web/.env`)**
- `VITE_API_URL` — backend base URL (default `http://localhost:3001/api/`)
- `VITE_WS_URL` — transcription socket (default `ws://localhost:3001/api/transcribe`)
- `VITE_DEBUG` — set `true` to show Leva controls panel
