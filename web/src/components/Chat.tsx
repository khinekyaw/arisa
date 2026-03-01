import { cn } from "@/lib/utils"
import axios from "axios"
import { Disc, Mic, Send } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useAudioRecorder } from "../hooks/useAudioRecorder"
import { useAvatarStore } from "../store/avatarStore"

const api = axios.create({
  baseURL: "http://localhost:3001/api/",
  timeout: 50000,
})

interface ChatResponse {
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
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<
    { message: string; fromUser?: boolean }[]
  >([])
  const [input, setInput] = useState("")
  const setValues = useAvatarStore((s) => s.setValues)
  const {
    isRecording,
    startRecording,
    stopRecording,
    audioBlob,
    clearRecording,
  } = useAudioRecorder()

  const handleResponse = (data: ChatResponse) => {
    setMessages((prev) => [...prev, { message: data.message }])
    setValues(data)
  }

  const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    const text = input.trim()
    setMessages((prev) => [...prev, { message: text, fromUser: true }])
    setInput("")

    const response = await api.post<ChatResponse>("/chat/test", { text })
    if (response.data) handleResponse(response.data)
  }

  useEffect(() => {
    if (!audioBlob) return

    const formData = new FormData()
    formData.append("audio", audioBlob, "recording.webm")
    clearRecording()

    const fetchChat = async () => {
      const response = await api.post<ChatResponse>("/chat/test", formData)
      if (response.data) handleResponse(response.data)
    }

    fetchChat()
  }, [audioBlob])

  return (
    <div className="fixed bottom-5 w-125 -translate-x-1/2 left-1/2 text-sm">
      <div className="rounded-xl bg-black/10 backdrop-blur-sm py-2 px-3 shadow text-white/80">
        <div className="h-12 overflow-scroll no-scrollbar">
          <ul className="flex flex-col gap-1">
            {messages.map((msg, index) => (
              <li key={index} className={msg.fromUser ? "text-right" : ""}>
                {msg.message}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 mt-2">
          <form onSubmit={sendMessage} className="flex gap-2 flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              className="flex-1 border-0 ring-0 outline-0"
            />
            <button
              type="submit"
              className="h-10 w-10 rounded-full border border-black/10 [&_svg]:w-4 [&_svg]:h-4 flex items-center justify-center transition hover:bg-black/5"
            >
              <Send />
            </button>
          </form>
          <button
            className={cn(
              "h-10 w-10 rounded-full border border-black/10 [&_svg]:w-4 [&_svg]:h-4 flex items-center justify-center transition hover:bg-black/5",
              isRecording && "bg-red-500/10 hover:bg-red-500/15",
            )}
            onClick={() => (isRecording ? stopRecording() : startRecording())}
          >
            {isRecording ? <Disc /> : <Mic />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Chat
