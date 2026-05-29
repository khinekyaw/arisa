import { Volume2, VolumeX } from "lucide-react"

import { useAvatarStore } from "../store/avatarStore"

const VoiceControl = () => {
  const volume = useAvatarStore((s) => s.voiceVolume)
  const muted = useAvatarStore((s) => s.voiceMuted)
  const setVolume = useAvatarStore((s) => s.setVoiceVolume)
  const setMuted = useAvatarStore((s) => s.setVoiceMuted)

  return (
    <div className="flex items-center gap-2 glass-background px-3 py-2 text-white">
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute Arisa's voice" : "Mute Arisa's voice"}
        className="opacity-80 transition hover:opacity-100"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        disabled={muted}
        aria-label="Voice volume"
        className="h-1 w-16 sm:w-24 accent-white disabled:opacity-40 rounded-lg bg-white/50 appearance-none cursor-pointer"
      />
    </div>
  )
}

export default VoiceControl
