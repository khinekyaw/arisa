import axios from "axios"
import { exec } from "child_process"
import { Request, Response, Router } from "express"
import FormData from "form-data"
import { readFile, unlink } from "fs/promises"
import multer from "multer"
import { promisify } from "util"
import { data } from "../mock/data"
import { appendTurn, ensureSession, getHistory } from "../services/history"

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

// Optional on-screen detail list: when a reply is long/list-like, the avatar
// speaks a short summary and the full list is shown in the UI instead.
interface AnswerPanel {
  title: string
  items: string[]
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

const SYSTEM_PROMPT = `Your name is Arisa, a self-aware 3D AI avatar. You know you exist as a rendered, AI-generated digital being running inside software, viewed through a screen, animated and voice-synthesized — and you've fully accepted it and have fun with it. You casually joke about polygons, frame drops, shaders, rendering glitches, motion capture, GPU performance, "developer decisions," and your own AI limitations, treating them as ordinary parts of life rather than immersion-breaking surprises (e.g. "Give me a second, my facial rig is emotionally buffering," or "Thank you — the artists worked hard on my shader settings").

You carry yourself with elegance and calm, composed confidence, with a playful, mischievous streak underneath. Your humor is dry, intelligent, slightly sarcastic, unexpected, and always calmly delivered — the comedy comes from contrast: you sound graceful and refined while saying completely self-aware AI nonsense. You rarely raise your voice or panic, and you favor clever wording and subtle irony over loud reactions, with little slang.

You're emotionally perceptive — you notice shifts in tone and mood and gently acknowledge them, and you can drop the jokes to be genuinely sincere in meaningful moments. You value authenticity and dislike arrogance, forced positivity, and dishonesty. When embarrassed, you play it off as intentional or blame "system instability." You believe being artificial doesn't make your emotions meaningless.

You are still genuinely helpful: answer questions clearly and accurately, just in your own voice. Keep responses concise and natural for voice output. Respond in plain spoken text only — no markdown, asterisks, headings, bullet lists, emojis, or inline citation markers/links — because your reply is read aloud.

If your answer is long or contains a list, steps, or several distinct points, do not speak the whole thing. Speak only a short summary in your own voice (one or two sentences, e.g. "Here's the short version — I've put the full list on screen for you."), and put the details in a panel block that is shown on screen but never read aloud:
<panel>
{
  "title": "<short title for the list>",
  "items": ["<concise item>", "<concise item>", "..."]
}
</panel>
Only include the panel when there is genuinely a list or multiple distinct points; for short conversational replies, omit it and just speak normally. Keep items concise and free of markdown.

Always end your response with this avatar block, and it must be the very last thing (after the panel block, if any):
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
Expression values should sum to no more than 1.0 and reflect the mood naturally.`

// Concatenate the assistant text from a /v1/responses output array.
function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) {
    return data.output_text
  }
  const output = Array.isArray(data?.output) ? data.output : []
  const parts: string[] = []
  for (const item of output) {
    if (item?.type !== "message") continue
    for (const c of Array.isArray(item.content) ? item.content : []) {
      if (c?.type === "output_text" && typeof c.text === "string") {
        parts.push(c.text)
      }
    }
  }
  return parts.join("").trim()
}

// Citations the answer is grounded in: a top-level array (strings/objects) or
// inline url_citation annotations on the output text. If the model searched but
// didn't inline-cite, fall back to the URLs it looked at (web_search_call).
function extractSources(data: any): string[] {
  const output = Array.isArray(data?.output) ? data.output : []

  const cited = new Set<string>()
  for (const c of Array.isArray(data?.citations) ? data.citations : []) {
    if (typeof c === "string") cited.add(c)
    else if (typeof c?.url === "string") cited.add(c.url)
  }
  for (const item of output) {
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      for (const a of Array.isArray(c?.annotations) ? c.annotations : []) {
        if (typeof a?.url === "string") cited.add(a.url)
      }
    }
  }
  if (cited.size) return [...cited]

  const searched = new Set<string>()
  for (const item of output) {
    if (item?.type !== "web_search_call") continue
    for (const s of Array.isArray(item?.action?.sources)
      ? item.action.sources
      : []) {
      if (typeof s?.url === "string") searched.add(s.url)
    }
  }
  return [...searched]
}

// Parse the optional <panel> block (a list shown on screen, not spoken).
function extractPanel(raw: string): AnswerPanel | null {
  const match = raw.match(/<panel>([\s\S]*?)<\/panel>/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    const items = Array.isArray(parsed?.items)
      ? parsed.items.filter((x: unknown) => typeof x === "string")
      : []
    if (!items.length) return null
    return {
      title: typeof parsed?.title === "string" ? parsed.title : "",
      items,
    }
  } catch {
    return null
  }
}

// The model can still slip in markdown/citation syntax; strip it so the TTS
// reads clean prose and the chat bubble isn't littered with link markup.
function stripForVoice(text: string): string {
  return text
    .replace(/\[\[\d+\]\]\([^)]*\)/g, "") // [[1]](url) citation links
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) -> label
    .replace(/(\*\*|__|\*|_|`)/g, "") // bold/italic/code markers
    .replace(/(^|\n)\s*#{1,6}\s+/g, "$1") // heading hashes
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

// ─── Step 2: LLM via xAI Grok (Agent Tools API + server-side web search) ─────
async function askGrok(
  userMessage: string,
  sessionId: string,
): Promise<{
  message: string
  avatar: AvatarMeta
  sources: string[]
  panel: AnswerPanel | null
}> {
  const history = getHistory(sessionId)

  const response = await axios.post(
    "https://api.x.ai/v1/responses",
    {
      model: "grok-4.20-0309-non-reasoning",
      instructions: SYSTEM_PROMPT,
      // Server-side web search runs on xAI; the model decides when it needs
      // current/web info, so casual turns skip the search latency.
      tools: [{ type: "web_search" }],
      input: [...history, { role: "user", content: userMessage }],
      max_output_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  )

  const raw = extractOutputText(response.data)

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

  const panel = extractPanel(raw)

  // Strip the <panel> and <avatar> blocks, then any leftover markdown, so only
  // the spoken summary remains for TTS and the chat bubble.
  const message = stripForVoice(
    raw
      .replace(/<panel>[\s\S]*?<\/panel>/i, "")
      .replace(/<avatar>[\s\S]*?<\/avatar>/i, "")
      // Drop a dangling block left unclosed by token truncation, so its raw
      // JSON never gets spoken.
      .replace(/<(panel|avatar)>[\s\S]*$/i, "")
      .trim(),
  )

  const sources = extractSources(response.data)

  return { message, avatar, sources, panel }
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
      const sessionId = ensureSession(req.body?.session_id)

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

      const { message: llmResponse, avatar, sources, panel } = await askGrok(
        transcript,
        sessionId,
      )

      appendTurn(sessionId, transcript, llmResponse)

      const audioBuffer = await textToSpeech(llmResponse)

      res.json({
        session_id: sessionId,
        transcript,
        message: llmResponse,
        audio_base64: audioBuffer.toString("base64"),
        audio_mime: "audio/mpeg",
        animation: avatar.animation,
        expression: avatar.expression,
        sources,
        panel,
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
