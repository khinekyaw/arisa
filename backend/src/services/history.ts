import { randomUUID } from "crypto"
import { db } from "../db"

// Number of most-recent messages loaded into the LLM context per turn.
export const DEFAULT_HISTORY_LIMIT = 20

export interface HistoryMessage {
  role: "user" | "assistant"
  content: string
}

const insertSession = db.prepare(
  "INSERT OR IGNORE INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)",
)
const touchSession = db.prepare(
  "UPDATE sessions SET updated_at = ? WHERE id = ?",
)
const insertMessage = db.prepare(
  "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
)
const selectRecent = db.prepare(
  "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
)

// Returns the session id, creating the row if it doesn't exist.
export function ensureSession(sessionId?: string): string {
  const id = sessionId || randomUUID()
  const now = Date.now()
  insertSession.run(id, now, now)
  return id
}

// Most recent `limit` messages in chronological order (sliding window).
// Full history stays persisted; only the tail is fed to the model.
export function getHistory(
  sessionId: string,
  limit = DEFAULT_HISTORY_LIMIT,
): HistoryMessage[] {
  const rows = selectRecent.all(sessionId, limit) as HistoryMessage[]
  return rows.reverse()
}

export function appendTurn(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): void {
  const now = Date.now()
  const tx = db.transaction(() => {
    insertMessage.run(sessionId, "user", userMessage, now)
    insertMessage.run(sessionId, "assistant", assistantMessage, now + 1)
    touchSession.run(now, sessionId)
  })
  tx()
}
