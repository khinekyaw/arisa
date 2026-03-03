import { useAvatarStore } from "@/store/avatarStore"
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm"
import { useFrame } from "@react-three/fiber"
import { useControls } from "leva"
import { useCallback } from "react"
import { lerp } from "three/src/math/MathUtils.js"

const IS_DEBUG = import.meta.env.VITE_DEBUG === 'true'

export function useVRMExpressions(vrm: VRM | null) {
  const avatarState = useAvatarStore((s) => s.values)
  const controls = useControls(
    "VRM",
    {
      aa: { value: 0, min: 0, max: 1 },
      ih: { value: 0, min: 0, max: 1 },
      ee: { value: 0, min: 0, max: 1 },
      oh: { value: 0, min: 0, max: 1 },
      ou: { value: 0, min: 0, max: 1 },
      blink: { value: 0, min: 0, max: 1 },
      blinkLeft: { value: 0, min: 0, max: 1 },
      blinkRight: { value: 0, min: 0, max: 1 },
      angry: { value: 0, min: 0, max: 1 },
      sad: { value: 0, min: 0, max: 1 },
      happy: { value: 0, min: 0, max: 1 },
      relaxed: { value: 0.2, min: 0, max: 1 },
      neutral: { value: 0, min: 0, max: 1 },
      Surprised: { value: 0, min: 0, max: 1 },
    },
    { render: () => IS_DEBUG },
  )

  // backend returned all small
  const keyNameMap: Record<string, string> = {
    surprised: "Surprised",
  }

  const getExpressionKey = (key: string) => {
    return keyNameMap[key]
  }

  const lerpExpression = useCallback(
    (name: VRMExpressionPresetName, value: number, lerpFactor: number) => {
      if (!vrm?.expressionManager) return
      const current = vrm.expressionManager.getValue(name) ?? 0
      vrm.expressionManager.setValue(name, lerp(current, value, lerpFactor))
    },
    [vrm],
  )

  useFrame((_, delta) => {
    if (!vrm) return
    if (avatarState?.expression) {
      Object.entries(avatarState.expression)?.map(([key, value]) => {
        lerpExpression(
          getExpressionKey(key) as VRMExpressionPresetName,
          value,
          delta * 12,
        )
      })
    } else {
      const entries = Object.entries(controls) as [
        VRMExpressionPresetName,
        number,
      ][]
      entries.forEach(([name, value]) =>
        lerpExpression(name, value, delta * 12),
      )
    }
  })
}
