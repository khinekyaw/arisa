import { Server } from "http"
import { WebSocket, WebSocketServer } from "ws"

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v2_realtime"
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173"

const ELEVENLABS_STT_URL = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${STT_MODEL_ID}`

// Bridges a browser client to the ElevenLabs realtime STT socket.
// The browser sends `input_audio_chunk` messages (base64 PCM); ElevenLabs
// replies with `partial_transcript` / `committed_transcript`. The API key
// never leaves the server — the browser only talks to this proxy.
export function attachTranscribeSocket(server: Server): void {
  const wss = new WebSocketServer({
    server,
    path: "/api/transcribe",
    verifyClient: ({ origin }, done) => {
      if (origin && origin !== ALLOWED_ORIGIN) {
        done(false, 403, "Forbidden origin")
        return
      }
      done(true)
    },
  })

  wss.on("connection", (client) => {
    const upstream = new WebSocket(ELEVENLABS_STT_URL, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    })

    const pending: string[] = []
    let upstreamOpen = false

    upstream.on("open", () => {
      upstreamOpen = true
      for (const msg of pending) upstream.send(msg)
      pending.length = 0
    })

    client.on("message", (data) => {
      const msg = data.toString()
      if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
        upstream.send(msg)
      } else {
        pending.push(msg)
      }
    })

    upstream.on("message", (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString())
    })

    const closeBoth = () => {
      if (client.readyState === WebSocket.OPEN) client.close()
      if (upstream.readyState === WebSocket.OPEN) upstream.close()
    }

    client.on("close", closeBoth)
    client.on("error", closeBoth)
    upstream.on("close", closeBoth)
    upstream.on("error", (err) => {
      console.error("ElevenLabs STT socket error:", err.message)
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            message_type: "error",
            message: "Upstream transcription error",
          }),
        )
      }
      closeBoth()
    })
  })
}
