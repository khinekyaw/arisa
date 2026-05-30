import { rateLimit } from "express-rate-limit"
import { Request, Response } from "express"

// Per-IP rate limits on the expensive /api/chat pipeline (STT + LLM + TTS) so a
// single client can't burn through API tokens. Two windows stack: a short burst
// limit and a daily cap. Both default tight and are tunable via env.
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 10
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY) || 100

function limitReached(res: Response, message: string) {
  res.status(429).json({ error: message })
}

export const chatPerMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  // Default key is the client IP (req.ip), which honors the configured
  // `trust proxy` setting so it's the real client behind a reverse proxy.
  handler: (_req: Request, res: Response) =>
    limitReached(res, "Too many requests. Please slow down and try again shortly."),
})

export const chatPerDay = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) =>
    limitReached(res, "Daily usage limit reached. Please try again tomorrow."),
})
