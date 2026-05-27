import axios from "axios"
import { Disc, Mic, Send } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useAudioRecorder } from "../hooks/useAudioRecorder"
import { useAvatarStore } from "../store/avatarStore"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/",
  timeout: 50000,
})

const chatApiPath = "chat"

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

    const response = await api.post<ChatResponse>(chatApiPath, { text })
    if (response.data) handleResponse(response.data)
  }

  useEffect(() => {
    if (!audioBlob) return

    const formData = new FormData()
    formData.append("audio", audioBlob, "recording.webm")
    clearRecording()

    const fetchChat = async () => {
      const response = await api.post<ChatResponse>(chatApiPath, formData)
      if (response.data) handleResponse(response.data)
    }

    fetchChat()
  }, [audioBlob])

  const msgLen = messages?.length || 0

  return (
    <div className="fixed bottom-6 w-125 z-50 -translate-x-1/2 left-1/2 text-sm">
      <div>
        <ul className="flex flex-col gap-1 text-white">
          {messages?.slice(msgLen - 1).map((msg, index) => (
            <li
              key={index}
              className="bg-white/5 block backdrop-blur-2xl rounded-2xl border-2 border-white/5 px-3 py-1 w-fit text-sm transition animate-in"
            >
              {msg.message}
            </li>
          ))}
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
            className="w-14"
            onClick={() => (isRecording ? stopRecording() : startRecording())}
          >
            {isRecording ? <Disc /> : <Mic />}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Chat
