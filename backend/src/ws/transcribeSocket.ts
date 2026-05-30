import { Server } from "http"
import { WebSocket, WebSocketServer } from "ws"

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const XAI_API_KEY = process.env.XAI_API_KEY!
const STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v2_realtime"
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173"

// Provider toggle — default to xAI, set to "elevenlabs" to fall back.
const STT_PROVIDER = (process.env.STT_PROVIDER || "xai").toLowerCase()

const ELEVENLABS_STT_URL = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${STT_MODEL_ID}`

// The browser hardcodes a 16kHz AudioContext and streams signed 16-bit PCM,
// so the upstream xAI socket is opened with matching format params.
const XAI_STT_URL =
  "wss://api.x.ai/v1/stt?sample_rate=16000&encoding=pcm&interim_results=true&language=en"

// Bridges a browser client to a realtime STT socket. The browser always speaks
// the ElevenLabs-style wire protocol — it sends `input_audio_chunk` messages
// (base64 PCM) and expects `partial_transcript` / `committed_transcript` back.
// For the xAI provider this proxy translates that protocol to/from xAI's binary
// frames + `transcript.partial` / `transcript.done` events, so the frontend
// stays provider-agnostic. The API key never leaves the server.
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
    if (STT_PROVIDER === "elevenlabs") {
      bridgeElevenLabs(client)
    } else {
      bridgeXai(client)
    }
  })
}

// ─── ElevenLabs: transparent pass-through (same wire protocol both ways) ──────
function bridgeElevenLabs(client: WebSocket): void {
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
    sendClientError(client, "Upstream transcription error")
    closeBoth()
  })
}

// ─── xAI: translate ElevenLabs-style protocol ⇄ xAI streaming STT ─────────────
function bridgeXai(client: WebSocket): void {
  const upstream = new WebSocket(XAI_STT_URL, {
    headers: { Authorization: `Bearer ${XAI_API_KEY}` },
  })

  // Queue audio that arrives before the upstream socket is ready.
  const pending: Buffer[] = []
  let upstreamOpen = false
  let doneSent = false

  const flushBinary = (buf: Buffer) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(buf)
    } else {
      pending.push(buf)
    }
  }

  upstream.on("open", () => {
    upstreamOpen = true
    for (const buf of pending) upstream.send(buf)
    pending.length = 0
  })

  client.on("message", (data) => {
    let msg: {
      message_type?: string
      audio_base_64?: string
      commit?: boolean
    }
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.message_type !== "input_audio_chunk") return

    if (msg.audio_base_64) {
      flushBinary(Buffer.from(msg.audio_base_64, "base64"))
    }
    // The client's final commit (empty audio + commit) ends the utterance.
    if (msg.commit && !doneSent) {
      doneSent = true
      const signalDone = () => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify({ type: "audio.done" }))
        }
      }
      if (upstreamOpen) signalDone()
      else upstream.once("open", signalDone)
    }
  })

  // xAI delivers the final words in `transcript.partial` events flagged
  // `is_final`; the closing `transcript.done` carries an empty `text`. So we
  // accumulate the finalized segments here and emit them as the committed
  // transcript ourselves, rather than trusting `transcript.done.text`.
  let committed = ""
  let lastInterim = ""

  upstream.on("message", (data) => {
    let msg: {
      type?: string
      text?: string
      is_final?: boolean
      message?: string
    }
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (client.readyState !== WebSocket.OPEN) return

    switch (msg.type) {
      case "transcript.partial": {
        const text = msg.text ?? ""
        if (msg.is_final) {
          committed = `${committed} ${text}`.trim()
          lastInterim = ""
        } else {
          lastInterim = text
        }
        // Show the running utterance (finalized + current interim) live.
        client.send(
          JSON.stringify({
            message_type: "partial_transcript",
            text: `${committed} ${lastInterim}`.trim(),
          }),
        )
        break
      }
      // End of utterance — its `text` is empty, so fall back to what we kept.
      case "transcript.done": {
        const finalText =
          (msg.text && msg.text.trim()) || committed || lastInterim
        client.send(
          JSON.stringify({
            message_type: "committed_transcript",
            text: finalText,
          }),
        )
        committed = ""
        lastInterim = ""
        break
      }
      case "error":
        sendClientError(client, msg.message || "xAI transcription error")
        break
    }
  })

  const closeBoth = () => {
    if (client.readyState === WebSocket.OPEN) client.close()
    if (upstream.readyState === WebSocket.OPEN) upstream.close()
  }

  client.on("close", closeBoth)
  client.on("error", closeBoth)
  upstream.on("close", closeBoth)
  upstream.on("error", (err) => {
    console.error("xAI STT socket error:", err.message)
    sendClientError(client, "Upstream transcription error")
    closeBoth()
  })
}

function sendClientError(client: WebSocket, message: string): void {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ message_type: "error", message }))
  }
}
