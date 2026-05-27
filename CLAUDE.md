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
- `web/src/hooks/useStreamingTranscription.ts` — live mic transcription (client)

## Env Files

- `web/.env` — `VITE_DEBUG`, `VITE_API_URL`, `VITE_WS_URL`
- `backend/.env` — `PORT`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_STT_MODEL_ID`, `XAI_API_KEY`, `CLIENT_ORIGIN`

Both are gitignored. Use `.env.example` as template.

## Watch Out For

- `useFBX` calls in `useVRMAnimations.tsx` must remain unconditional — adding an animation requires a new line, not a loop
- VRM expression hooks share `expressionManager`; always lerp values, never hard-set
- `VITE_` prefix required on all env vars exposed to the frontend
- The LLM system prompt in `voiceRoute.ts` defines the `<avatar>` JSON format — keep it in sync with the `AvatarMeta` interface
- Session history in `voiceRoute.ts` is in-memory and not shared across workers
- The transcription WS proxy must keep `ELEVENLABS_API_KEY` server-side — never send it to the browser
- Voice input streams PCM live for transcription, then sends the final text to `/api/chat` (no audio upload); the batch STT path in `voiceRoute.ts` remains for direct audio POSTs
