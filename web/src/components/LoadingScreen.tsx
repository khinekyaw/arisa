import { useProgress } from "@react-three/drei"
import { useEffect, useRef, useState } from "react"

const LoadingScreen = () => {
  const { active, progress } = useProgress()
  const [shown, setShown] = useState(active)
  // Assets load in separate batches (the model blob, then the FBX animations),
  // so progress resets 100 → 0 and `active` briefly flips off between them.
  // Keep a monotonic value so the bar never jumps backward in one session.
  const [display, setDisplay] = useState(0)
  const maxRef = useRef(0)

  useEffect(() => {
    if (progress > maxRef.current) {
      maxRef.current = progress
      setDisplay(progress)
    }
  }, [progress])

  useEffect(() => {
    if (active) {
      setShown(true)
      return
    }
    // Debounce hiding so the gap between batches doesn't flicker the screen
    // off and back on. Reset the bar only once we're truly done.
    const t = window.setTimeout(() => {
      setShown(false)
      maxRef.current = 0
      setDisplay(0)
    }, 500)
    return () => window.clearTimeout(t)
  }, [active])

  if (!shown) return null

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
            style={{ width: `${display}%` }}
          />
        </div>
        <span className="text-xs opacity-70">{Math.round(display)}%</span>
      </div>
    </div>
  )
}

export default LoadingScreen
