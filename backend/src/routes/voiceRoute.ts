import axios from "axios"
import { exec } from "child_process"
import { randomUUID } from "crypto"
import { Request, Response, Router } from "express"
import FormData from "form-data"
import { readFile, unlink } from "fs/promises"
import multer from "multer"
import { promisify } from "util"
import { data } from "../mock/data"

const router = Router()
const upload = multer({ dest: "/tmp/" })
const execAsync = promisify(exec)

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const XAI_API_KEY = process.env.XAI_API_KEY!
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "hpp4J3VqNfWAUOO0d1Us" // Default: Bella

type AnimationName =
  | "idle"
  | "happy_idle"
  | "fighting_idle"
  | "talk"
  | "think"
  | "wave"
  | "arguing"
  | "dance"
  | "talk_1"
  | "thank"

interface AvatarMeta {
  animation: AnimationName
  expression: {
    happy: number
    sad: number
    angry: number
    relaxed: number
    suprised: number
  }
}

// ─── Message History ─────────────────────────────────────────────────────────
const MAX_HISTORY = 20

interface HistoryMessage {
  role: "user" | "assistant"
  content: string
}

// In-memory history store keyed by sessionId
const sessionHistories = new Map<string, HistoryMessage[]>()

function getHistory(sessionId: string): HistoryMessage[] {
  if (!sessionHistories.has(sessionId)) {
    sessionHistories.set(sessionId, [])
  }
  return sessionHistories.get(sessionId)!
}

function appendHistory(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): void {
  const history = getHistory(sessionId)
  history.push({ role: "user", content: userMessage })
  history.push({ role: "assistant", content: assistantMessage })
  // Keep only the last MAX_HISTORY messages (pairs)
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY)
  }
}

// ─── Step 1: Speech-to-Text via ElevenLabs ───────────────────────────────────
async function speechToText(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append("file", audioBuffer, {
    filename: "audio.webm",
    contentType: mimeType,
  })
  formData.append("model_id", "scribe_v1")

  const response = await axios.post(
    "https://api.elevenlabs.io/v1/speech-to-text",
    formData,
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        ...formData.getHeaders(),
      },
    },
  )

  return response.data.text
}

// ─── Step 2: LLM via xAI Grok ────────────────────────────────────────────────
async function askGrok(
  userMessage: string,
  sessionId: string,
): Promise<{ message: string; avatar: AvatarMeta }> {
  const history = getHistory(sessionId)

  const response = await axios.post(
    "https://api.x.ai/v1/chat/completions",
    {
      model: "grok-4-1-fast-non-reasoning",
      messages: [
        {
          role: "system",
          content: `Your name is Arisa. You are a helpful, conversational assistant. Keep responses concise and natural for voice output.

At the end of every response, append a JSON block (and nothing after it) in this exact format:
<avatar>
{
  "animation": "<one of: idle, idle_1, happy, fighting_idle, greet, talk, talk_1, think, wave, arguing, dance, thank>",
  "expression": {
    "happy": <0.0–1.0>,
    "sad": <0.0–1.0>,
    "angry": <0.0–1.0>,
    "relaxed": <0.0–1.0>,
    "surprised": <0.0–1.0>
  }
}
</avatar>

Pick the animation and expression values that best match the emotional tone of your response.
For a normal answer use "talk" or "talk_1". For greetings use "wave" or "greet". For thanks use "thank". 
For excited/positive news use "happy". For confused/thinking use "think". For dancing/fun use "dance".
Expression values should sum to no more than 1.0 and reflect the mood naturally.`,
        },
        ...history,
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 600,
    },
    {
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  )

  const raw: string = response.data.choices[0].message.content

  // Parse out the <avatar> block
  const avatarMatch = raw.match(/<avatar>([\s\S]*?)<\/avatar>/)
  let avatar: AvatarMeta = {
    animation: "talk",
    expression: { happy: 0.2, sad: 0, angry: 0, relaxed: 0.1, suprised: 0 },
  }

  if (avatarMatch) {
    try {
      avatar = JSON.parse(avatarMatch[1].trim())
    } catch {
      // keep defaults if parse fails
    }
  }

  // Strip the <avatar> block from the spoken message
  const message = raw.replace(/<avatar>[\s\S]*?<\/avatar>/, "").trim()

  return { message, avatar }
}

// ─── Step 3: Text-to-Speech via ElevenLabs ───────────────────────────────────
async function textToSpeech(text: string): Promise<Buffer> {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    },
  )

  return Buffer.from(response.data)
}

async function getVisemesFromAudio(filePath: string): Promise<any> {
  const jsonPath = `${filePath}.json`

  try {
    await execAsync(`rhubarb -f json -o "${jsonPath}" "${filePath}"`)
    const json = await readFile(jsonPath, "utf-8")
    return JSON.parse(json)
  } finally {
    await Promise.allSettled([unlink(filePath), unlink(jsonPath)])
  }
}

// ─── Main Endpoint: POST /api/chat ─────────────────────────────────────
// Accepts either:
//   - multipart/form-data with an `audio` file (voice input → STT → LLM)
//   - multipart/form-data or application/json with a `text` field (skip STT)
// Optional: pass `session_id` in the body to maintain conversation history.
//   If omitted, a new session is created and the ID is returned in the response.
router.post(
  "/chat",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const textInput: string | undefined = req.body?.text
      const sessionId: string = req.body?.session_id || randomUUID()

      if (!textInput && !req.file) {
        res
          .status(400)
          .json({ error: "Provide either an audio file or a text field." })
        return
      }

      let transcript: string

      if (textInput) {
        transcript = textInput
      } else {
        const mimeType = req.file!.mimetype || "audio/webm"
        const audioFileBuffer = await readFile(req.file!.path)
        transcript = await speechToText(audioFileBuffer, mimeType)
      }

      const { message: llmResponse, avatar } = await askGrok(
        transcript,
        sessionId,
      )

      appendHistory(sessionId, transcript, llmResponse)

      const audioBuffer = await textToSpeech(llmResponse)

      res.json({
        session_id: sessionId,
        transcript,
        message: llmResponse,
        audio_base64: audioBuffer.toString("base64"),
        audio_mime: "audio/mpeg",
        animation: avatar.animation,
        expression: avatar.expression,
      })
    } catch (error: any) {
      res.status(500).json({
        error: "Voice pipeline failed",
        details: error?.response?.data || error.message,
      })
    }
  },
)

router.post(
  "/chat/test",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    res.json(data[1])
  },
)

export default router
