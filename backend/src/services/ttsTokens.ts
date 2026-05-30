import { randomUUID } from "crypto"

// Short-lived handoff between POST /api/chat (which has the reply text) and the
// streaming GET /api/tts/:token the browser's <audio> element hits. Keeping the
// text out of the URL avoids length/escaping issues and lets /chat return
// immediately after the LLM while audio streams separately. In-memory is fine
// for the single-host deploy. Not consumed on read, so range/retry requests by
// the audio element still resolve within the TTL.
const TTL_MS = 2 * 60 * 1000

const tokens = new Map<string, { text: string; expiresAt: number }>()

export function createTtsToken(text: string): string {
  const token = randomUUID()
  tokens.set(token, { text, expiresAt: Date.now() + TTL_MS })
  return token
}

export function getTtsText(token: string): string | null {
  const entry = tokens.get(token)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    tokens.delete(token)
    return null
  }
  return entry.text
}

// Periodic sweep so abandoned tokens (audio never requested) don't accumulate.
setInterval(() => {
  const now = Date.now()
  for (const [token, entry] of tokens) {
    if (now > entry.expiresAt) tokens.delete(token)
  }
}, 60 * 1000).unref()
