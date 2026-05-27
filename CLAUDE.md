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
- `backend/.env` — `PORT`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STT_MODEL_ID`, `XAI_API_KEY`, `CLIENT_ORIGIN`, `DATABASE_PATH`

Both are gitignored. Use `.env.example` as template.

## Watch Out For

- `useFBX` calls in `useVRMAnimations.tsx` must remain unconditional — adding an animation requires a new line, not a loop
- VRM expression hooks share `expressionManager`; always lerp values, never hard-set
- `VITE_` prefix required on all env vars exposed to the frontend
- The LLM system prompt in `voiceRoute.ts` defines the `<avatar>` JSON format — keep it in sync with the `AvatarMeta` interface
- Conversation memory is SQLite (`better-sqlite3`) via `services/history.ts`; `getHistory` is a sliding window (last `DEFAULT_HISTORY_LIMIT` messages), full history stays persisted. Frontend must send `session_id` (stored in `localStorage` as `arisa_session_id`) for memory to work
- `better-sqlite3` is a native module — reinstall (`npm install`) after Node version changes or it will fail to load
- The transcription WS proxy must keep `ELEVENLABS_API_KEY` server-side — never send it to the browser
- Voice input is hands-free and continuous: the mic button toggles `convoActive` in `Chat.tsx`. Client-side VAD in `useStreamingTranscription.ts` transcribes on speech onset and auto-sends to `/api/chat` after trailing silence; the loop re-arms each turn. The batch STT path in `voiceRoute.ts` remains for direct audio POSTs
- Anti-feedback: the re-arm effect in `Chat.tsx` must keep gating on `isAudioPlaying` — never arm the mic while the avatar's TTS is playing, or it will transcribe its own voice
- VAD thresholds (`speechThreshold`, `silenceThreshold`, `silenceMs`) are tunable options on `useStreamingTranscription`; defaults are mic-dependent and may need adjusting
