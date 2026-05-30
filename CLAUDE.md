# CLAUDE.md — Arisa v1

## Project

Voice AI avatar. Frontend (React/Three.js/VRM) + Backend (Express/ElevenLabs/xAI).

## Dev Commands

```bash
# Start both concurrently (from project root)
cd backend && npm run dev   # port 3001
cd web && npm run dev       # port 5173

# Type-check
cd web && npx tsc --noEmit
cd backend && npx tsc --noEmit

# Lint
cd web && npm run lint
```

## Conventions

- No semicolons (enforced by project style)
- Double quotes for strings in TSX/TS
- Imports: external packages first, then `@/` aliases, then relative
- No comments unless the WHY is non-obvious
- `@/` alias maps to `web/src/`

## Project Structure

See `AGENT.md` for full architecture. Key files:

- `web/src/store/avatarStore.ts` — Zustand store, single source of truth for avatar state
- `web/src/components/Chat.tsx` — API client + chat UI
- `web/src/components/Avatar.tsx` — VRM loader + all VRM hooks
- `backend/src/routes/voiceRoute.ts` — entire voice pipeline (STT → LLM → TTS)
- `backend/src/ws/transcribeSocket.ts` — WS proxy to ElevenLabs realtime STT
- `backend/src/db/index.ts` + `backend/src/services/history.ts` — SQLite conversation memory
- `web/src/hooks/useStreamingTranscription.ts` — live mic transcription (client)

## Env Files

- `web/.env` — `VITE_DEBUG` (universal). Dev-only `VITE_API_URL`/`VITE_WS_URL` live in `web/.env.development` (loaded by `vite dev`, NOT `vite build`) so production builds default to the same origin the app is served from. See `DEPLOY.md`
- `backend/.env` — `PORT`, `TTS_PROVIDER`, `STT_PROVIDER`, `XAI_API_KEY`, `XAI_TTS_VOICE`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STT_MODEL_ID`, `CLIENT_ORIGIN`, `DATABASE_PATH`, `TRUST_PROXY`, `STATIC_DIR`, `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_PER_DAY`

Both are gitignored. Use `.env.example` as template.

## Watch Out For

- `useFBX` calls in `useVRMAnimations.tsx` must remain unconditional — adding an animation requires a new line, not a loop
- VRM expression hooks share `expressionManager`; always lerp values, never hard-set
- Never attach R3F pointer handlers (`onClick`/`onPointerOver`) directly to the VRM meshes: R3F raycasts on every pointer move and skinned-mesh raycasting re-skins all vertices on the CPU, tanking FPS during clicks/hover/zoom. The VRM meshes set `raycast = () => {}` in `Avatar.tsx`; use the invisible box collider for clicks
- `VITE_` prefix required on all env vars exposed to the frontend
- The LLM system prompt in `voiceRoute.ts` defines the `<avatar>` JSON format — keep it in sync with the `AvatarMeta` interface
- Conversation memory is SQLite (`better-sqlite3`) via `services/history.ts`; `getHistory` is a sliding window (last `DEFAULT_HISTORY_LIMIT` messages), full history stays persisted. Frontend must send `session_id` (stored in `localStorage` as `arisa_session_id`) for memory to work
- `better-sqlite3` is a native module — reinstall (`npm install`) after Node version changes or it will fail to load
- The transcription WS proxy must keep `ELEVENLABS_API_KEY`/`XAI_API_KEY` server-side — never send it to the browser
- Voice providers are toggleable per-channel via `TTS_PROVIDER`/`STT_PROVIDER` (`xai` default, `elevenlabs` fallback). TTS and batch STT dispatch in `voiceRoute.ts`; realtime STT in `transcribeSocket.ts`. The browser always speaks the ElevenLabs-style WS protocol (`input_audio_chunk` ⇄ `partial_transcript`/`committed_transcript`); for xAI the proxy translates that to/from xAI's binary frames + `transcript.partial`/`transcript.done`, so the frontend is provider-agnostic — don't add provider logic to `useStreamingTranscription.ts`
- Voice input is hands-free and continuous: the mic button toggles `convoActive` in `Chat.tsx`. Client-side VAD in `useStreamingTranscription.ts` transcribes on speech onset and auto-sends to `/api/chat` after trailing silence; the loop re-arms each turn. The batch STT path in `voiceRoute.ts` remains for direct audio POSTs
- Barge-in is currently DISABLED: the mic does not re-arm while Arisa's TTS is playing (the `if (isAudioPlaying) return` guard in the `Chat.tsx` re-arm effect), so she always finishes her reply before listening again. This prevents her own voice (residual echo past AEC) from tripping the VAD and cutting herself off. The interrupt plumbing is dormant but intact — `interruptVoice()`/`voiceInterruptNonce` in `avatarStore.ts` and the nonce-watching effect in `useVRMLipSync.ts` — so re-enabling means restoring the barge-in effect + removing that guard in `Chat.tsx`
- VAD thresholds (`speechThreshold`, `silenceThreshold`, `silenceMs`) are tunable options on `useStreamingTranscription`; defaults are mic-dependent and may need adjusting
- Single-host deploy: in production `index.ts` serves `web/dist` (via `STATIC_DIR`, default `../web/dist`) with an SPA fallback regex that excludes `/api/`. The transcription WS shares the origin. `app.set("trust proxy", TRUST_PROXY)` must match your proxy hop count or `req.ip` (and rate limiting) will be wrong. See `DEPLOY.md`
- `POST /api/chat` is rate-limited per client IP (`middleware/rateLimit.ts`): `RATE_LIMIT_PER_MIN` (default 10) and `RATE_LIMIT_PER_DAY` (default 100), returning 429 over the cap. The limiters run before multer so floods are rejected before the upload/STT/LLM/TTS spend. The `/api/transcribe` WS is not yet rate-limited (origin-checked only)
