import dotenv from "dotenv"
import express from "express"
const cors = require("cors")
dotenv.config()

import voiceRouter from "./routes/voiceRoute"

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
