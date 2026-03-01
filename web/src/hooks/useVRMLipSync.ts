import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm"
import { useFrame } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { lerp } from "three/src/math/MathUtils.js"
import { useAvatarStore } from "../store/avatarStore"

const VISEME_TO_VRM: Record<string, VRMExpressionPresetName | null> = {
  A: VRMExpressionPresetName.Aa,
  B: VRMExpressionPresetName.Aa,
  C: VRMExpressionPresetName.Ih,
  D: VRMExpressionPresetName.Ee,
  E: VRMExpressionPresetName.Ee,
  F: VRMExpressionPresetName.Oh,
  G: VRMExpressionPresetName.Oh,
  H: VRMExpressionPresetName.Aa,
  X: null,
}

const VISEME_WEIGHT: Record<string, number> = {
  A: 1.0,
  B: 0.35,
  C: 0.6,
  D: 0.7,
  E: 0.5,
  F: 0.7,
  G: 0.8,
  H: 0.4,
  X: 0,
}

const ALL_LIP_EXPRESSIONS = [
  VRMExpressionPresetName.Aa,
  VRMExpressionPresetName.Ih,
  VRMExpressionPresetName.Ou,
  VRMExpressionPresetName.Ee,
  VRMExpressionPresetName.Oh,
] as const

export function useVRMLipSync(vrm: VRM | null | undefined, lerpSpeed = 12) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const avatarState = useAvatarStore((s) => s.values)
  const setAudioPlaying = useAvatarStore((s) => s.setAudioPlaying)

  // Whenever store gets a new speech payload, play it
  useEffect(() => {
    if (!avatarState) return

    audioRef.current?.pause()
    const audio = new Audio(
      `data:${avatarState.audio_mime};base64,${avatarState.audio_base64}`,
    )
    audioRef.current = audio
    audio.play()

    audio.addEventListener("play", () => setAudioPlaying(true))
    audio.addEventListener("ended", () => setAudioPlaying(false))

    return () => {
      audio.removeEventListener("play", () => setAudioPlaying(true))
      audio.removeEventListener("ended", () => setAudioPlaying(false))
    }
  }, [avatarState])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useFrame((_, delta) => {
    const mgr = vrm?.expressionManager
    if (!mgr) return

    const audio = audioRef.current
    const cues = avatarState?.visemes.mouthCues ?? []
    const t = audio && !audio.paused ? audio.currentTime : null

    const activeCue =
      t !== null ? (cues.find((c) => t >= c.start && t < c.end) ?? null) : null
    const targetExpression = activeCue
      ? (VISEME_TO_VRM[activeCue.value] ?? null)
      : null
    const targetWeight = activeCue ? (VISEME_WEIGHT[activeCue.value] ?? 0) : 0

    for (const expr of ALL_LIP_EXPRESSIONS) {
      const current = mgr.getValue(expr) ?? 0
      mgr.setValue(
        expr,
        lerp(
          current,
          targetExpression === expr ? targetWeight : 0,
          delta * lerpSpeed,
        ),
      )
    }

    // mgr.update()
  })
}
