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

## Live Transcription (WebSocket)

While the user holds a voice turn, the mic is transcribed in real time and shown
as a live bubble — separate from the `/api/chat` pipeline.

```
Mic → AudioContext (16kHz PCM) → ws://…/api/transcribe (backend proxy)
                                      │  adds xi-api-key, forwards
                                      ▼
                          ElevenLabs Scribe v2 Realtime
                                      │
        partial_transcript ──────────┤  (live, updates the bubble)
        committed_transcript ────────┘  (final segment)
```

- **Frontend**: `useStreamingTranscription.ts` captures mic audio via the Web
  Audio API, converts Float32 → 16-bit PCM, base64-encodes it, and sends
  `input_audio_chunk` messages. It exposes `start()`, `stop()`, `isListening`,
  `isConnecting`, and the running `transcript`.
- **Backend**: `ws/transcribeSocket.ts` is a thin proxy. It opens an upstream WS
  to ElevenLabs with the `xi-api-key` header (the key never reaches the browser)
  and pipes messages both ways. Origin is checked against `CLIENT_ORIGIN`.
- **On stop**: `stop()` sends a final `commit:true` chunk, waits up to 2s for the
  last `committed_transcript`, then resolves with the full text. `Chat.tsx` sends
  that text to `POST /api/chat` as the `text` field — skipping the batch STT step
  entirely (no redundant transcription, lower cost).

The model is `scribe_v2_realtime` (override via `ELEVENLABS_STT_MODEL_ID`).
Audio is PCM at the AudioContext sample rate (requested 16kHz; the actual rate
is read back and sent per-chunk, so any supported rate works without resampling).

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

**Frontend (`web/.env`)**
- `VITE_API_URL` — backend base URL (default `http://localhost:3001/api/`)
- `VITE_WS_URL` — transcription socket (default `ws://localhost:3001/api/transcribe`)
- `VITE_DEBUG` — set `true` to show Leva controls panel
