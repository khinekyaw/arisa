import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm"
import { useFrame } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { lerp } from "three/src/math/MathUtils.js"
import { Lipsync, VISEMES } from "wawa-lipsync"
import { useAvatarStore } from "../store/avatarStore"

const lipsyncManager = new Lipsync()

const VISEME_TO_VRM: Partial<Record<VISEMES, VRMExpressionPresetName>> = {
  // Silence / closed mouth
  [VISEMES.sil]: undefined, // no expression = closed

  // Bilabial / labial (P, B, M, F, V) → slight open or neutral
  [VISEMES.PP]: undefined, // lips together, use closed
  [VISEMES.FF]: undefined, // teeth on lip, near closed

  // Dental / interdental (TH, T, D, N, L, S, Z, CH, SH)
  [VISEMES.TH]: VRMExpressionPresetName.Ih, // tongue tip visible, "ih"
  [VISEMES.DD]: VRMExpressionPresetName.Ih,
  [VISEMES.kk]: VRMExpressionPresetName.Ih,
  [VISEMES.CH]: VRMExpressionPresetName.Ih,
  [VISEMES.SS]: VRMExpressionPresetName.Ih,
  [VISEMES.nn]: VRMExpressionPresetName.Ih,
  [VISEMES.RR]: VRMExpressionPresetName.Ih,

  // Vowels — direct mapping
  [VISEMES.aa]: VRMExpressionPresetName.Aa, // "father"
  [VISEMES.E]: VRMExpressionPresetName.Ee, // "bed"
  [VISEMES.I]: VRMExpressionPresetName.Ih, // "bit"
  [VISEMES.O]: VRMExpressionPresetName.Oh, // "go"
  [VISEMES.U]: VRMExpressionPresetName.Ou, // "food"
}

const ALL_LIP_EXPRESSIONS = [
  VRMExpressionPresetName.Aa,
  VRMExpressionPresetName.Ih,
  VRMExpressionPresetName.Ou,
  VRMExpressionPresetName.Ee,
  VRMExpressionPresetName.Oh,
] as const

export function useVRMLipSync(vrm: VRM | null | undefined, lerpSpeed = 16) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const avatarState = useAvatarStore((s) => s.values)
  const isAudioPlaying = useAvatarStore((s) => s.isAudioPlaying)
  const setAudioPlaying = useAvatarStore((s) => s.setAudioPlaying)
  const voiceVolume = useAvatarStore((s) => s.voiceVolume)
  const voiceMuted = useAvatarStore((s) => s.voiceMuted)
  const voiceInterruptNonce = useAvatarStore((s) => s.voiceInterruptNonce)
  const didMountRef = useRef(false)

  // Whenever store gets a new speech payload, play it
  useEffect(() => {
    if (!avatarState?.audio_base64) return

    audioRef.current?.pause()
    const audio = new Audio(
      `data:${avatarState.audio_mime};base64,${avatarState.audio_base64}`,
    )
    const { voiceMuted, voiceVolume } = useAvatarStore.getState()
    audio.volume = voiceMuted ? 0 : voiceVolume
    audioRef.current = audio
    audio.play()

    lipsyncManager.connectAudio(audio)

    audio.addEventListener("play", () => setAudioPlaying(true))
    audio.addEventListener("ended", () => setAudioPlaying(false))

    return () => {
      audio.removeEventListener("play", () => setAudioPlaying(true))
      audio.removeEventListener("ended", () => setAudioPlaying(false))
    }
  }, [avatarState])

  // Apply volume/mute changes to audio that is already playing.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = voiceMuted ? 0 : voiceVolume
    }
  }, [voiceVolume, voiceMuted])

  // Barge-in: stop the current utterance the moment the user interrupts.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    audioRef.current?.pause()
    audioRef.current = null
    setAudioPlaying(false)
  }, [voiceInterruptNonce, setAudioPlaying])

  useFrame((_, delta) => {
    const mgr = vrm?.expressionManager
    if (!mgr) return
    let viseme = null

    // Reset all mouth shapes
    if (isAudioPlaying) {
      lipsyncManager.processAudio()
      viseme = lipsyncManager.viseme
      // console.log("viseme:", viseme)
    }
    for (const expr of ALL_LIP_EXPRESSIONS) {
      const current = mgr.getValue(expr) ?? 0
      const target = viseme ? VISEME_TO_VRM[viseme] : null
      mgr.setValue(
        expr,
        lerp(current, target === expr ? 1 : 0, delta * lerpSpeed),
      )
    }
  })

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])
}
