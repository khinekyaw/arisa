import dotenv from "dotenv"
import express from "express"
import { existsSync } from "fs"
import http from "http"
import path from "path"
const cors = require("cors")
dotenv.config()

import voiceRouter from "./routes/voiceRoute"
import { attachTranscribeSocket } from "./ws/transcribeSocket"

const app = express()
const PORT = process.env.PORT || 3000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173"

// Number of reverse proxies in front of us. Needed so `req.ip` (used for rate
// limiting) reflects the real client, not the proxy. Defaults to 1 (one proxy,
// e.g. nginx or a PaaS load balancer); set to 0 when exposed directly.
const TRUST_PROXY =
  process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1
app.set("trust proxy", TRUST_PROXY)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors({ origin: CLIENT_ORIGIN }))

// Voice pipeline route
app.use("/api", voiceRouter)

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" })
})

// Single-host deploy: serve the built frontend (web/dist) and fall back to
// index.html for client-side routing. Falls through to a JSON banner in dev
// when no build is present. STATIC_DIR overrides the default location.
const staticDir =
  process.env.STATIC_DIR || path.resolve(__dirname, "../../web/dist")

if (existsSync(staticDir)) {
  app.use(express.static(staticDir))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"))
  })
} else {
  app.get("/", (_req, res) => {
    res.json({
      message: "Voice AI API",
      endpoints: {
        "POST /api/chat":
          "Upload audio → returns JSON with transcript + base64 audio",
      },
    })
  })
}

const server = http.createServer(app)
attachTranscribeSocket(server)

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Transcription socket on path /api/transcribe`)
  if (existsSync(staticDir)) console.log(`Serving frontend from ${staticDir}`)
})
