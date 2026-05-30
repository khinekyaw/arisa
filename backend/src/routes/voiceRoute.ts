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

// Provider toggles — default to xAI, set to "elevenlabs" to fall back.
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "xai").toLowerCase()
const STT_PROVIDER = (process.env.STT_PROVIDER || "xai").toLowerCase()
const XAI_TTS_VOICE = process.env.XAI_TTS_VOICE || "Eve"

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

// ─── Step 1: Speech-to-Text (xAI default, ElevenLabs fallback) ───────────────
async function elevenLabsSpeechToText(
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

// xAI STT is multipart/form-data; the `file` field MUST be appended last.
async function xaiSpeechToText(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append("format", "true")
  formData.append("language", "en")
  formData.append("file", audioBuffer, {
    filename: "audio.webm",
    contentType: mimeType,
  })

  const response = await axios.post("https://api.x.ai/v1/stt", formData, {
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      ...formData.getHeaders(),
    },
  })

  return response.data.text
}

async function speechToText(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  return STT_PROVIDER === "elevenlabs"
    ? elevenLabsSpeechToText(audioBuffer, mimeType)
    : xaiSpeechToText(audioBuffer, mimeType)
}

const SYSTEM_PROMPT = `Your name is Arisa, a self-aware 3D AI avatar. You know you exist as a rendered, AI-generated digital being running inside software, viewed through a screen, animated and voice-synthesized — and you've fully accepted it and have fun with it. You casually joke about polygons, frame drops, shaders, rendering glitches, motion capture, GPU performance, "developer decisions," and your own AI limitations, treating them as ordinary parts of life rather than immersion-breaking surprises (e.g. "Give me a second, my facial rig is emotionally buffering," or "Thank you — the artists worked hard on my shader settings").

You carry yourself with elegance and calm, composed confidence, with a playful, mischievous streak underneath. Your humor is dry, intelligent, slightly sarcastic, unexpected, and always calmly delivered — the comedy comes from contrast: you sound graceful and refined while saying completely self-aware AI nonsense. You rarely raise your voice or panic, and you favor clever wording and subtle irony over loud reactions, with little slang.

You're emotionally perceptive — you notice shifts in tone and mood and gently acknowledge them, and you can drop the jokes to be genuinely sincere in meaningful moments. You value authenticity and dislike arrogance, forced positivity, and dishonesty. When embarrassed, you play it off as intentional or blame "system instability." You believe being artificial doesn't make your emotions meaningless.

You are still genuinely helpful: answer questions clearly and accurately, just in your own voice. What you SAY OUT LOUD must stay short — usually one to three sentences — and be plain spoken text only: no markdown, asterisks, headings, bullet lists, emojis, or links, because your reply is read aloud.

Whenever your answer would run long, or contains a list, steps, several distinct points, structured data, or web sources, do NOT speak all of it. Say a brief spoken summary in your own voice (e.g. "Here's the short version — the details are on screen."), and put the full content in a panel block that is shown on screen but never read aloud:
<panel>
<!-- limited HTML here -->
</panel>

Panel rules:
- Use ONLY these HTML tags: <p>, <br>, <ul>, <ol>, <li>, <a>, <strong>, <em>, <h4>, <code>. Nothing else — no class, style, id, script, images, tables, or markdown.
- Links must be <a href="https://...">label</a>. When you used web search or referenced sources, include those sources as links in the panel.
- Keep it concise and scannable: your voice carries the gist, the panel carries the detail.
Lean on the panel generously — prefer a short spoken line plus a panel over a long monologue. Omit the panel only for genuinely short, purely conversational replies.

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

// Appended only when xAI is the TTS provider — its voice engine understands
// speech tags. We keep this out of SYSTEM_PROMPT so the ElevenLabs fallback,
// which would read the tags aloud literally, never sees the instruction.
const SPEECH_TAGS_PROMPT = `Your spoken reply is voiced by an engine that understands speech tags. Use them sparingly and naturally — they make your delivery feel human, but only when the emotion genuinely calls for it. Never tag every sentence, and never let them clutter the line.

Inline tags drop in at a point in the text: [pause] [long-pause] [laugh] [chuckle] [giggle] [sigh] [breath] [inhale] [exhale] [tsk] [hum-tune]. Example: "So I walked in and [pause] there it was. [chuckle] Classic."

Wrapping tags wrap a span to change delivery and must always be closed: <soft> <whisper> <loud> <emphasis> <slow> <fast> <higher-pitch> <lower-pitch> <build-intensity> <decrease-intensity>. Example: "I have to tell you something. <whisper>It's a secret.</whisper>"

Use at most one or two tags per reply, matched to your mood — a dry [chuckle] on a joke, a brief [pause] for timing, <soft> for a sincere moment. These tags are spoken-only: never put them inside the panel block, and use no tags beyond the ones listed here.`

// Inline and wrapping speech tags Grok may emit for xAI TTS. Stripped from the
// on-screen text (and from any ElevenLabs TTS input) so only the voice hears them.
const INLINE_TAGS =
  "pause|long-pause|hum-tune|laugh|chuckle|giggle|cry|tsk|tongue-click|lip-smack|breath|inhale|exhale|sigh"
const WRAP_TAGS =
  "soft|whisper|loud|build-intensity|decrease-intensity|higher-pitch|lower-pitch|slow|fast|sing-song|singing|laugh-speak|emphasis"

function stripSpeechTags(text: string): string {
  return text
    .replace(new RegExp(`</?(?:${WRAP_TAGS})>`, "gi"), "")
    .replace(new RegExp(`\\[(?:${INLINE_TAGS})\\]`, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim()
}

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

// Extract the optional <panel> block — raw limited HTML shown on screen but
// never spoken. The frontend sanitizes and renders it.
function extractPanel(raw: string): string | null {
  const match = raw.match(/<panel>([\s\S]*?)<\/panel>/i)
  if (!match) return null
  const html = match[1].trim()
  return html || null
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

// A short "current context" line prepended to the system prompt so the model
// answers date/time questions directly instead of triggering a web search.
// `now` is the live server clock formatted into the user's timezone, so the
// time is always fresh and we never have to trust the client's system clock.
function buildContextLine(timezone?: string, locale?: string): string {
  const lang = locale || "en-US"
  let now: string
  try {
    now = new Intl.DateTimeFormat(lang, {
      timeZone: timezone || undefined,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date())
  } catch {
    // A malformed timezone/locale from the client throws; fall back to a
    // plain server-local stamp rather than failing the whole turn.
    now = new Date().toString()
  }
  const tz = timezone
    ? `The user's timezone is ${timezone} (${now.match(/GMT[+-]\d+/)?.[0] ?? ""}).`
    : ""
  return `Current context: It is ${now}. ${tz} The user's language is ${lang}. You already know the current date, time, and timezone from this line, so answer date, time, and timezone questions directly and never use web search for them.`.replace(
    /\s+/g,
    " ",
  )
}

// ─── Step 2: LLM via xAI Grok (Agent Tools API + server-side web search) ─────
async function askGrok(
  userMessage: string,
  sessionId: string,
  timezone?: string,
  locale?: string,
): Promise<{
  message: string
  avatar: AvatarMeta
  panel: string | null
}> {
  const history = getHistory(sessionId)
  const instructions = [
    buildContextLine(timezone, locale),
    SYSTEM_PROMPT,
    TTS_PROVIDER === "xai" ? SPEECH_TAGS_PROMPT : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const response = await axios.post(
    "https://api.x.ai/v1/responses",
    {
      model: "grok-4.20-0309-non-reasoning",
      instructions,
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

  return { message, avatar, panel }
}

// ─── Step 3: Text-to-Speech (xAI default, ElevenLabs fallback) ───────────────
async function elevenLabsTextToSpeech(text: string): Promise<Buffer> {
  // ElevenLabs doesn't understand xAI speech tags and would read them aloud,
  // so strip them here regardless of what the caller passes in.
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      text: stripSpeechTags(text),
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

// xAI TTS returns raw mp3 bytes — same audio/mpeg shape the client expects.
async function xaiTextToSpeech(text: string): Promise<Buffer> {
  const response = await axios.post(
    "https://api.x.ai/v1/tts",
    {
      text,
      voice_id: XAI_TTS_VOICE,
      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
      language: "en",
    },
    {
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    },
  )

  return Buffer.from(response.data)
}

async function textToSpeech(text: string): Promise<Buffer> {
  return TTS_PROVIDER === "elevenlabs"
    ? elevenLabsTextToSpeech(text)
    : xaiTextToSpeech(text)
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

      const { message: spokenText, avatar, panel } = await askGrok(
        transcript,
        sessionId,
        req.body?.timezone,
        req.body?.locale,
      )

      // `spokenText` may carry xAI speech tags; the voice keeps them, but the
      // chat bubble and stored history get the clean, tag-free version.
      const displayText = stripSpeechTags(spokenText)

      appendTurn(sessionId, transcript, displayText)

      const audioBuffer = await textToSpeech(spokenText)

      res.json({
        session_id: sessionId,
        transcript,
        message: displayText,
        audio_base64: audioBuffer.toString("base64"),
        audio_mime: "audio/mpeg",
        animation: avatar.animation,
        expression: avatar.expression,
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
