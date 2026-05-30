import { useEffect, useRef, useState } from "react"
import { readSetting, SETTINGS_KEYS, writeSetting } from "../lib/settings"

const BGM_SRC = "/sound/massobeats_noon.mp3"
const DEFAULT_VOLUME = 0.08

export function useBgm() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Restored from localStorage so music on/off and level persist across visits.
  const [enabled, setEnabled] = useState(() =>
    readSetting(SETTINGS_KEYS.bgmEnabled, true),
  )
  const [volume, setVolume] = useState(() =>
    readSetting(SETTINGS_KEYS.bgmVolume, DEFAULT_VOLUME),
  )

  useEffect(() => {
    const audio = new Audio(BGM_SRC)
    audio.loop = true
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  // Owns the audio level: applies the restored/changed volume and persists it.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    writeSetting(SETTINGS_KEYS.bgmVolume, volume)
  }, [volume])

  useEffect(() => {
    writeSetting(SETTINGS_KEYS.bgmEnabled, enabled)
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
