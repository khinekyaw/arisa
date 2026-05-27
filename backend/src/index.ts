import dotenv from "dotenv"
import express from "express"
import http from "http"
const cors = require("cors")
dotenv.config()

import voiceRouter from "./routes/voiceRoute"
import { attachTranscribeSocket } from "./ws/transcribeSocket"

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  cors({
    origin: "http://localhost:5173",
  }),
)

// Voice pipeline route
app.use("/api", voiceRouter)

app.get("/", (req, res) => {
  res.json({
    message: "Voice AI API",
    endpoints: {
      "POST /api/chat":
        "Upload audio → returns JSON with transcript + base64 audio",
    },
  })
})

const server = http.createServer(app)
attachTranscribeSocket(server)

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Transcription socket on ws://localhost:${PORT}/api/transcribe`)
})
