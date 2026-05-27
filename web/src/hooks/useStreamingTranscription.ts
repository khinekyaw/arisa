import { useCallback, useRef, useState } from "react"

const WS_URL =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/api/transcribe"

// How long to wait after stopping for ElevenLabs to flush a final commit.
const FINAL_COMMIT_TIMEOUT = 2000

interface UseStreamingTranscription {
  isListening: boolean
  isConnecting: boolean
  transcript: string
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<string>
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

export function useStreamingTranscription(): UseStreamingTranscription {
  const [isListening, setIsListening] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sampleRateRef = useRef(16000)

  // Committed segments are final; the partial is the in-progress tail.
  const committedRef = useRef("")
  const partialRef = useRef("")
  const finalResolveRef = useRef<((text: string) => void) | null>(null)

  const fullText = () =>
    `${committedRef.current} ${partialRef.current}`.replace(/\s+/g, " ").trim()

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    ctxRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    ctxRef.current = null
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
        partialRef.current = msg.text ?? ""
        setTranscript(fullText())
        break
      case "committed_transcript":
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

  const start = useCallback(async () => {
    setError(null)
    setTranscript("")
    committedRef.current = ""
    partialRef.current = ""
    setIsConnecting(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      ctxRef.current = ctx
      sampleRateRef.current = ctx.sampleRate

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error("Failed to connect to transcription"))
      })

      ws.onmessage = (e) => handleMessage(e.data)
      ws.onclose = () => setIsListening(false)

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0))
        ws.send(
          JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: bufferToBase64(pcm),
            commit: false,
            sample_rate: sampleRateRef.current,
          }),
        )
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      setIsConnecting(false)
      setIsListening(true)
    } catch (err) {
      setIsConnecting(false)
      setError(err instanceof Error ? err.message : "Microphone access denied")
      teardownAudio()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [handleMessage, teardownAudio])

  const stop = useCallback(async (): Promise<string> => {
    teardownAudio()
    setIsListening(false)

    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const text = fullText()
      wsRef.current = null
      return text
    }

    // Flush: ask ElevenLabs to commit whatever is buffered, then wait briefly
    // for the final committed_transcript before closing.
    const finalText = await new Promise<string>((resolve) => {
      let settled = false
      const finish = (text: string) => {
        if (settled) return
        settled = true
        finalResolveRef.current = null
        resolve(text)
      }
      finalResolveRef.current = finish

      ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true,
          sample_rate: sampleRateRef.current,
        }),
      )

      setTimeout(() => finish(fullText()), FINAL_COMMIT_TIMEOUT)
    })

    ws.close()
    wsRef.current = null
    return finalText
  }, [teardownAudio])

  return { isListening, isConnecting, transcript, error, start, stop }
}
