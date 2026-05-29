import { useProgress } from "@react-three/drei"
import { useEffect, useState } from "react"

const LoadingScreen = () => {
  const { active, progress } = useProgress()
  const [visible, setVisible] = useState(active)
  // Assets load in separate batches (the model blob, then the FBX animations),
  // so progress resets 100 → 0 and `active` briefly flips off between them.
  // Keep a monotonic value so the bar never jumps backward in one session.
  const [maxProgress, setMaxProgress] = useState(0)

  // Show as soon as loading starts, and advance the bar — adjusted during
  // render (no effect) so it can't trigger cascading re-renders.
  if (active && !visible) setVisible(true)
  if (progress > maxProgress) setMaxProgress(progress)

  // Hide after a short debounce once loading stops, so the gap between batches
  // doesn't flicker the screen off and back on. The timer is an external system,
  // so this belongs in an effect; the reset runs in its callback.
  useEffect(() => {
    if (active) return
    const t = window.setTimeout(() => {
      setVisible(false)
      setMaxProgress(0)
    }, 500)
    return () => window.clearTimeout(t)
  }, [active])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "linear-gradient(0deg, #ae99e7 0%, #8993e4 100%)" }}
    >
      <div className="glass-background flex w-64 max-w-[80vw] flex-col items-center gap-4 px-8 py-7 text-white">
        <span className="text-sm font-medium tracking-wide">Loading Arisa…</span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
            style={{ width: `${maxProgress}%` }}
          />
        </div>
        <span className="text-xs opacity-70">{Math.round(maxProgress)}%</span>
      </div>
    </div>
  )
}

export default LoadingScreen
