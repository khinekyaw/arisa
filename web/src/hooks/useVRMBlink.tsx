import type { VRM } from "@pixiv/three-vrm"
import { useFrame } from "@react-three/fiber"
import { useRef } from "react"

interface UseVRMBlinkOptions {
  /** Minimum seconds between blinks. Default: `3` */
  minInterval?: number
  /** Maximum seconds between blinks. Default: `6` */
  maxInterval?: number
  /** Seconds to fully close eyes. Default: `0.08` */
  closeSpeed?: number
  /** Seconds to fully open eyes (slower feels more natural). Default: `0.13` */
  openSpeed?: number
  /** VRM expression name. Use `"blinkLeft"` / `"blinkRight"` for independent eyes. Default: `"blink"` */
  expression?: string
  /** Set `false` to pause blinking. Default: `true` */
  enabled?: boolean
}

type BlinkPhase = "open" | "closing" | "opening"

interface BlinkState {
  phase: BlinkPhase
  timer: number
  nextBlink: number
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * `useVRMBlink`
 *
 * Drives a natural, randomised blink animation on a `@pixiv/three-vrm` VRM instance.
 * Must be called inside a component that is a descendant of `<Canvas>`.
 *
 * @example
 * ```tsx
 * function Avatar({ vrm }: { vrm: VRM | null }) {
 *   useFrame((_, delta) => vrm?.update(delta));
 *   useVRMBlink(vrm);
 *   return vrm ? <primitive object={vrm.scene} /> : null;
 * }
 * ```
 */
export function useVRMBlink(
  vrm: VRM | null | undefined,
  {
    minInterval = 3,
    maxInterval = 6,
    closeSpeed = 0.08,
    openSpeed = 0.13,
    expression = "blink",
    enabled = true,
  }: UseVRMBlinkOptions = {},
): void {
  const state = useRef<BlinkState>({
    phase: "open",
    timer: 0,
    nextBlink: randomBetween(minInterval, maxInterval),
  })

  useFrame((_, delta) => {
    if (!enabled || !vrm) return

    const mgr = vrm.expressionManager
    if (!mgr) return

    const s = state.current
    s.timer += delta

    switch (s.phase) {
      case "open": {
        if (s.timer >= s.nextBlink) {
          s.phase = "closing"
          s.timer = 0
        }
        break
      }

      case "closing": {
        const t = Math.min(s.timer / closeSpeed, 1)
        mgr.setValue(expression, t)
        if (t >= 1) {
          s.phase = "opening"
          s.timer = 0
        }
        break
      }

      case "opening": {
        const t = Math.min(s.timer / openSpeed, 1)
        mgr.setValue(expression, 1 - t)
        if (t >= 1) {
          mgr.setValue(expression, 0)
          s.phase = "open"
          s.timer = 0
          s.nextBlink = randomBetween(minInterval, maxInterval)
        }
        break
      }
    }

    mgr.update()
  })
}
