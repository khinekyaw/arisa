import { useCallback, useEffect, useRef, useState } from "react"
import { dbg } from "../lib/debug"

// In dev, web/.env sets VITE_WS_URL to the separate backend port. When unset
// (single-host production), derive it from the page origin so wss is used over
// https automatically.
function defaultWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:3001/api/transcribe"
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}/api/transcribe`
}

const WS_URL = import.meta.env.VITE_WS_URL ?? defaultWsUrl()

// How long to wait after committing for ElevenLabs to flush the final segment.
const FINAL_COMMIT_TIMEOUT = 2000

// VAD defaults (tunable via options). RMS is computed on normalised float audio.
const DEFAULTS = {
  bufferSize: 2048, // ~128ms per frame at 16kHz
  speechThreshold: 0.02, // RMS to register a voiced frame
  silenceThreshold: 0.012, // RMS below this counts as silence (hysteresis)
  minVoicedFrames: 2, // consecutive voiced frames to confirm speech onset
  silenceMs: 1200, // trailing silence that ends the turn
  prebufferFrames: 4, // frames kept before onset so the first word isn't clipped
  armTimeoutMs: 12000, // auto-cancel if the user never speaks
}

type Phase = "idle" | "armed" | "speaking"

interface UseStreamingTranscriptionOptions {
  /** Called with the final transcript when a turn ends (VAD silence or manual stop after speech). */
  onTurnEnd?: (transcript: string) => void
  silenceMs?: number
  speechThreshold?: number
  silenceThreshold?: number
}

interface UseStreamingTranscription {
  phase: Phase
  isListening: boolean
  transcript: string
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  cancel: () => void
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function computeRMS(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

export function useStreamingTranscription(
  options: UseStreamingTranscriptionOptions = {},
): UseStreamingTranscription {
  const speechThreshold = options.speechThreshold ?? DEFAULTS.speechThreshold
  const silenceThreshold = options.silenceThreshold ?? DEFAULTS.silenceThreshold
  const silenceMs = options.silenceMs ?? DEFAULTS.silenceMs

  const [phase, setPhase] = useState<Phase>("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef<Phase>("idle")
  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sampleRateRef = useRef(16000)
  const armTimerRef = useRef<number | null>(null)

  // VAD state
  const speechStartedRef = useRef(false)
  const voicedFramesRef = useRef(0)
  const silenceSecondsRef = useRef(0)
  const prebufferRef = useRef<string[]>([])
  const endingRef = useRef(false)

  // Transcript accumulation
  const committedRef = useRef("")
  const partialRef = useRef("")
  const finalResolveRef = useRef<((text: string) => void) | null>(null)

  const onTurnEndRef = useRef(options.onTurnEnd)
  useEffect(() => {
    onTurnEndRef.current = options.onTurnEnd
  })

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const fullText = () =>
    `${committedRef.current} ${partialRef.current}`.replace(/\s+/g, " ").trim()

  const teardownAudio = useCallback(() => {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    ctxRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    ctxRef.current = null
  }, [])

  const sendChunk = useCallback((audioBase64: string, commit = false) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: audioBase64,
        commit,
        sample_rate: sampleRateRef.current,
      }),
    )
  }, [])

  const handleMessage = useCallback((raw: string) => {
    let msg: { message_type?: string; text?: string; message?: string }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    switch (msg.message_type) {
      case "partial_transcript":
        dbg("partial_transcript ->", JSON.stringify(msg.text))
        partialRef.current = msg.text ?? ""
        setTranscript(fullText())
        break
      case "committed_transcript":
        dbg("committed_transcript ->", JSON.stringify(msg.text))
        committedRef.current = `${committedRef.current} ${msg.text ?? ""}`.trim()
        partialRef.current = ""
        setTranscript(fullText())
        finalResolveRef.current?.(fullText())
        break
      case "error":
        setError(msg.message ?? "Transcription error")
        break
    }
  }, [])

  // Flush a final commit and wait briefly for the last committed transcript.
  const finalizeTurn = useCallback(async (): Promise<string> => {
    teardownAudio()
    const ws = wsRef.current

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const text = fullText()
      wsRef.current = null
      return text
    }

    const finalText = await new Promise<string>((resolve) => {
      let settled = false
      const finish = (text: string) => {
        if (settled) return
        settled = true
        finalResolveRef.current = null
        resolve(text)
      }
      finalResolveRef.current = finish
      sendChunk("", true)
      window.setTimeout(() => finish(fullText()), FINAL_COMMIT_TIMEOUT)
    })

    ws.close()
    wsRef.current = null
    return finalText
  }, [sendChunk, teardownAudio])

  const resetState = useCallback(() => {
    speechStartedRef.current = false
    voicedFramesRef.current = 0
    silenceSecondsRef.current = 0
    prebufferRef.current = []
    endingRef.current = false
    committedRef.current = ""
    partialRef.current = ""
  }, [])

  // End the turn and hand the transcript to the caller for auto-send.
  const endTurn = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    const text = await finalizeTurn()
    setPhaseBoth("idle")
    dbg("endTurn -> text=", JSON.stringify(text), "| sending:", Boolean(text))
    if (text) onTurnEndRef.current?.(text)
  }, [finalizeTurn, setPhaseBoth])

  // Abort without sending (no speech detected, or manual cancel).
  const cancel = useCallback(() => {
    endingRef.current = true
    teardownAudio()
    wsRef.current?.close()
    wsRef.current = null
    setPhaseBoth("idle")
    setTranscript("")
  }, [setPhaseBoth, teardownAudio])

  const start = useCallback(async () => {
    // Guard against double-arming (e.g. the continuous-mode re-arm effect).
    if (phaseRef.current !== "idle") return
    dbg("start -> arming mic")
    setError(null)
    setTranscript("")
    resetState()
    setPhaseBoth("armed")

    try {
      // iOS/Safari only exposes getUserMedia in a secure context (https or
      // localhost). Fail with a clear message instead of a vague TypeError.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone needs a secure https connection. Open the site over https and allow mic access.",
        )
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // webkitAudioContext for older iOS Safari. iOS also ignores the requested
      // sampleRate (records at the hardware rate) and starts the context
      // suspended — resume it while still inside the mic gesture. The actual
      // rate is read back below and sent per-chunk so the server can match it.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      const ctx = new AudioCtx({ sampleRate: 16000 })
      ctxRef.current = ctx
      if (ctx.state === "suspended") await ctx.resume()
      sampleRateRef.current = ctx.sampleRate
      const frameSeconds = DEFAULTS.bufferSize / ctx.sampleRate

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () =>
          reject(new Error("Failed to connect to transcription"))
      })
      ws.onmessage = (e) => handleMessage(e.data)
      ws.onclose = () => {
        dbg(
          "ws.onclose | phase=",
          phaseRef.current,
          "ending=",
          endingRef.current,
        )
        if (phaseRef.current !== "idle" && !endingRef.current) {
          setPhaseBoth("idle")
        }
      }

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      const processor = ctx.createScriptProcessor(DEFAULTS.bufferSize, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (endingRef.current) return
        const channel = e.inputBuffer.getChannelData(0)
        const rms = computeRMS(channel)
        const audioBase64 = bufferToBase64(floatTo16BitPCM(channel))

        if (!speechStartedRef.current) {
          // Armed: buffer recent audio and watch for speech onset.
          prebufferRef.current.push(audioBase64)
          if (prebufferRef.current.length > DEFAULTS.prebufferFrames) {
            prebufferRef.current.shift()
          }
          voicedFramesRef.current =
            rms > speechThreshold ? voicedFramesRef.current + 1 : 0

          if (voicedFramesRef.current >= DEFAULTS.minVoicedFrames) {
            speechStartedRef.current = true
            dbg("onset -> speaking (rms=", rms.toFixed(3), ")")
            silenceSecondsRef.current = 0
            if (armTimerRef.current !== null) {
              clearTimeout(armTimerRef.current)
              armTimerRef.current = null
            }
            setPhaseBoth("speaking")
            for (const chunk of prebufferRef.current) sendChunk(chunk)
            prebufferRef.current = []
          }
          return
        }

        // Speaking: stream every frame and watch for trailing silence.
        sendChunk(audioBase64)
        if (rms < silenceThreshold) {
          silenceSecondsRef.current += frameSeconds
          if (silenceSecondsRef.current >= silenceMs / 1000) {
            void endTurn()
          }
        } else {
          silenceSecondsRef.current = 0
        }
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      // Auto-cancel if the user never starts speaking.
      armTimerRef.current = window.setTimeout(() => {
        if (!speechStartedRef.current) cancel()
      }, DEFAULTS.armTimeoutMs)
    } catch (err) {
      const name = (err as DOMException)?.name
      const message =
        name === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No microphone found."
            : err instanceof Error
              ? err.message
              : "Microphone access failed"
      setError(message)
      cancel()
    }
  }, [
    cancel,
    endTurn,
    handleMessage,
    resetState,
    sendChunk,
    setPhaseBoth,
    silenceMs,
    silenceThreshold,
    speechThreshold,
  ])

  // Manual stop: send what we have if the user already spoke, otherwise cancel.
  const stop = useCallback(async () => {
    if (phaseRef.current === "idle") return
    if (speechStartedRef.current) {
      await endTurn()
    } else {
      cancel()
    }
  }, [cancel, endTurn])

  return {
    phase,
    isListening: phase !== "idle",
    transcript,
    error,
    start,
    stop,
    cancel,
  }
}
