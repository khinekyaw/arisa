import { Music, VolumeX } from "lucide-react"

import { useBgm } from "../hooks/useBgm"

const BgmControl = () => {
  const { enabled, setEnabled, volume, setVolume } = useBgm()

  return (
    <div className="flex items-center gap-2 glass-background px-3 py-2 text-white">
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        aria-label={enabled ? "Disable music" : "Enable music"}
        className="opacity-80 transition hover:opacity-100"
      >
        {enabled ? <Music size={18} /> : <VolumeX size={18} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        disabled={!enabled}
        aria-label="Music volume"
        className="h-1 w-16 sm:w-24 accent-white disabled:opacity-40 rounded-lg bg-white/50 appearance-none cursor-pointer"
      />
    </div>
  )
}

export default BgmControl
