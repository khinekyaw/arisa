import axios from "axios"
import { Disc, Mic, Send } from "lucide-react"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useStreamingTranscription } from "../hooks/useStreamingTranscription"
import { useAvatarStore } from "../store/avatarStore"
import MarqueeText from "./MarqueeText"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/",
  timeout: 50000,
})

const chatApiPath = "chat"
const SESSION_KEY = "arisa_session_id"

// Fallback: if a reply produces no audio, clear the "thinking" gate after this
// long so the conversation loop doesn't stall.
const REPLY_FALLBACK_MS = 3000

interface ChatResponse {
  session_id: string
  audio_base64: string
  audio_mime: string
  message: string
  transcript: string
  visemes: {
    metadata: { duration: number }
    mouthCues: { start: number; end: number; value: string }[]
  }
  animation: string
  expression: Record<string, number>
  sources?: string[]
  panel?: { title: string; items: string[] } | null
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<
    { message: string; fromUser?: boolean }[]
  >([])
  const [input, setInput] = useState("")
  // Conversation mode: the mic re-arms itself turn after turn until toggled off.
  const [convoActive, setConvoActive] = useState(false)
  // True between sending a turn and the avatar starting to speak.
  const [pendingReply, setPendingReply] = useState(false)
  // The spoken reply auto-hides a couple seconds after the avatar finishes.
  const [replyHidden, setReplyHidden] = useState(false)

  const setValues = useAvatarStore((s) => s.setValues)
  const setSources = useAvatarStore((s) => s.setSources)
  const setPanel = useAvatarStore((s) => s.setPanel)
  const isAudioPlaying = useAvatarStore((s) => s.isAudioPlaying)

  // Persisted across reloads so the backend keeps conversation memory.
  const sessionIdRef = useRef<string | undefined>(
    localStorage.getItem(SESSION_KEY) ?? undefined,
  )

  const sendText = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { message: text, fromUser: true }])
      setPendingReply(true)
      try {
        const response = await api.post<ChatResponse>(chatApiPath, {
          text,
          session_id: sessionIdRef.current,
        })
        if (response.data) {
          if (response.data.session_id) {
            sessionIdRef.current = response.data.session_id
            localStorage.setItem(SESSION_KEY, response.data.session_id)
          }
          setMessages((prev) => [...prev, { message: response.data.message }])
          setValues(response.data)
          setSources(response.data.sources ?? [])
          setPanel(response.data.panel ?? null)
        }
      } finally {
        // Audio playback normally clears pendingReply; this guards replies
        // that never produce audio so the loop can continue.
        window.setTimeout(() => setPendingReply(false), REPLY_FALLBACK_MS)
      }
    },
    [setValues, setSources, setPanel],
  )

  const { phase, isListening, transcript, error, start, cancel } =
    useStreamingTranscription({ onTurnEnd: sendText })

  // Once the avatar starts speaking, the reply has arrived.
  useEffect(() => {
    if (isAudioPlaying) setPendingReply(false)
  }, [isAudioPlaying])

  // Keep the reply visible during any active turn; once the avatar has finished
  // speaking (and isn't listening or thinking), hide the result after 2s.
  useEffect(() => {
    if (isAudioPlaying || isListening || pendingReply) {
      setReplyHidden(false)
      return
    }
    const t = window.setTimeout(() => setReplyHidden(true), 2000)
    return () => clearTimeout(t)
  }, [isAudioPlaying, isListening, pendingReply])

  // Continuous loop: re-arm the mic only when idle, not awaiting a reply, and
  // the avatar is NOT speaking — so its voice can never feed back into STT.
  useEffect(() => {
    if (!convoActive) return
    if (phase !== "idle") return
    if (pendingReply) return
    if (isAudioPlaying) return
    void start()
  }, [convoActive, phase, pendingReply, isAudioPlaying, start])

  // Stop the loop on errors (e.g. mic permission denied) to avoid retry storms.
  useEffect(() => {
    if (error) setConvoActive(false)
  }, [error])

  const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput("")
    await sendText(text)
  }

  const toggleConversation = () => {
    if (convoActive) {
      setConvoActive(false)
      cancel()
    } else {
      setConvoActive(true)
    }
  }

  const lastMessage = messages[messages.length - 1]
  const liveLabel = phase === "speaking" ? transcript || "…" : "Listening…"

  const renderBubble = () => {
    if (isListening) return liveLabel
    if (pendingReply) return "Thinking…"
    if (lastMessage && !replyHidden) return lastMessage.message
    return null
  }
  const bubbleText = renderBubble()
  const isLive = isListening || pendingReply

  return (
    <div className="fixed bottom-6 w-125 z-50 -translate-x-1/2 left-1/2 text-sm">
      <div>
        <ul className="flex flex-col gap-1 text-white">
          {bubbleText && (
            <li
              className={
                isLive
                  ? "bg-white/10 block backdrop-blur-2xl rounded-2xl border-2 border-white/10 px-3 py-1 w-fit max-w-full text-sm transition animate-in italic opacity-80"
                  : "bg-white/5 block backdrop-blur-2xl rounded-2xl border-2 border-white/5 px-3 py-1 w-fit max-w-full text-sm transition animate-in"
              }
            >
              <MarqueeText text={bubbleText} />
            </li>
          )}
        </ul>
        <div className="flex gap-2 mt-2">
          <form onSubmit={sendMessage} className="flex gap-2 flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Anything"
            />
            <Button type="submit" className="w-14">
              <Send />
            </Button>
          </form>
          <Button
            className={
              convoActive ? "w-14 bg-red-500/30 hover:bg-red-500/40" : "w-14"
            }
            onClick={toggleConversation}
          >
            {convoActive ? <Disc /> : <Mic />}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Chat
