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

- `web/.env` — `VITE_DEBUG`, `VITE_API_URL`, `VITE_WS_URL`
- `backend/.env` — `PORT`, `TTS_PROVIDER`, `STT_PROVIDER`, `XAI_API_KEY`, `XAI_TTS_VOICE`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STT_MODEL_ID`, `CLIENT_ORIGIN`, `DATABASE_PATH`

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
- Barge-in: the mic re-arms even while Arisa's TTS is playing so the user can interrupt. This relies on `getUserMedia` `echoCancellation` (set in `useStreamingTranscription.ts`) so her own voice doesn't feed back into STT. When VAD confirms user speech (`phase === "speaking"`) during playback, `Chat.tsx` calls `interruptVoice()` and `useVRMLipSync.ts` stops the audio. If Arisa cuts herself off (e.g. loud speakers, weak AEC), raise `speechThreshold`
- VAD thresholds (`speechThreshold`, `silenceThreshold`, `silenceMs`) are tunable options on `useStreamingTranscription`; defaults are mic-dependent and may need adjusting
