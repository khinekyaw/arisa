import { useEffect, useRef, useState } from "react"

const BGM_SRC = "/sound/massobeats_noon.mp3"
const DEFAULT_VOLUME = 0.1

export function useBgm() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)

  useEffect(() => {
    const audio = new Audio(BGM_SRC)
    audio.loop = true
    audio.volume = DEFAULT_VOLUME
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!enabled) {
      audio.pause()
      return
    }

    const play = () => void audio.play().catch(() => {})
    play()

    // Browsers block autoplay with sound until a user gesture; retry once on
    // the first interaction if the initial play() was rejected.
    const onGesture = () => {
      play()
      removeGesture()
    }
    const removeGesture = () => {
      window.removeEventListener("pointerdown", onGesture)
      window.removeEventListener("keydown", onGesture)
    }
    window.addEventListener("pointerdown", onGesture)
    window.addEventListener("keydown", onGesture)

    return removeGesture
  }, [enabled])

  return { enabled, setEnabled, volume, setVolume }
}
