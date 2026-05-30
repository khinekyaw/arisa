import { VRM } from "@pixiv/three-vrm"
import { useAnimations, useFBX } from "@react-three/drei"
import { useControls } from "leva"
import { useCallback, useEffect, useMemo, useRef } from "react"

import { useAvatarStore } from "@/store/avatarStore"
import {
  AnimationAction,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Event,
} from "three"
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm"

const IS_DEBUG = import.meta.env.VITE_DEBUG === "true"

const ANIMATIONS = [
  { name: "idle", path: "/animations/idle.fbx" },
  { name: "idle_1", path: "/animations/idle_1.fbx" },
  { name: "idle_2", path: "/animations/idle_2.fbx" },
  { name: "happy", path: "/animations/happy.fbx" },
  { name: "talk", path: "/animations/talking.fbx" },
  { name: "think", path: "/animations/thinking.fbx" },
  { name: "wave", path: "/animations/waving.fbx" },
  { name: "arguing", path: "/animations/arguing.fbx" },
  { name: "dance", path: "/animations/snake_hip_hop_dance.fbx" },
  { name: "talk_1", path: "/animations/talking_1.fbx" },
  { name: "thank", path: "/animations/thankful.fbx" },
  { name: "greet", path: "/animations/greeting.fbx" },
  { name: "happy_idle", path: "/animations/happy_idle.fbx" },
  { name: "fan_idle", path: "/animations/hand_fan_idle.fbx" },
  { name: "nails_idle", path: "/animations/check_nails_idle.fbx" },
  { name: "react", path: "/animations/reacting.fbx" },
] as const

type AnimationName = (typeof ANIMATIONS)[number]["name"]

const ENABLE_RANDOM_IDLE: boolean = true
const ENABLE_CLICK_REACTION: boolean = true

// Calm base idles play most of the time. The expressive "special" idles appear
// only occasionally (~SPECIAL_IDLE_CHANCE) and never twice in a row.
const BASE_IDLE: AnimationName[] = ["idle", "idle_1", "idle_2"]
const SPECIAL_IDLE: AnimationName[] = ["fan_idle", "nails_idle"]
const SPECIAL_IDLE_CHANCE = 0.2

// Picks the next idle: weighted toward base idles, with no special-after-special
// and no exact repeat back-to-back.
function pickIdle(last: AnimationName | null): AnimationName {
  const lastWasSpecial = last !== null && SPECIAL_IDLE.includes(last)
  const useSpecial = !lastWasSpecial && Math.random() < SPECIAL_IDLE_CHANCE
  const pool = useSpecial ? SPECIAL_IDLE : BASE_IDLE
  const candidates = pool.filter((n) => n !== last)
  const choices = candidates.length ? candidates : pool
  return choices[Math.floor(Math.random() * choices.length)]
}

// How long an idle loops before switching to the next one.
const IDLE_HOLD_MIN_MS = 8000
const IDLE_HOLD_MAX_MS = 16000

// Crossfade durations: smooth between idles, responsive but still eased for
// reactions/one-shots (synchronised crossfade keeps it from feeling abrupt).
const IDLE_FADE = 0.5
const ONESHOT_FADE = 0.3

function useAllFBX() {
  const idle = useFBX(ANIMATIONS[0].path)
  const idle1 = useFBX(ANIMATIONS[1].path)
  const idle2 = useFBX(ANIMATIONS[2].path)
  const happy = useFBX(ANIMATIONS[3].path)
  const talk = useFBX(ANIMATIONS[4].path)
  const think = useFBX(ANIMATIONS[5].path)
  const wave = useFBX(ANIMATIONS[6].path)
  const arguing = useFBX(ANIMATIONS[7].path)
  const dance = useFBX(ANIMATIONS[8].path)
  const talk1 = useFBX(ANIMATIONS[9].path)
  const thank = useFBX(ANIMATIONS[10].path)
  const greet = useFBX(ANIMATIONS[11].path)
  const happyIdle = useFBX(ANIMATIONS[12].path)
  const fanIdle = useFBX(ANIMATIONS[13].path)
  const nailsIdle = useFBX(ANIMATIONS[14].path)
  const react = useFBX(ANIMATIONS[15].path)
  return useMemo(
    () => [
      idle,
      idle1,
      idle2,
      happy,
      talk,
      think,
      wave,
      arguing,
      dance,
      talk1,
      thank,
      greet,
      happyIdle,
      fanIdle,
      nailsIdle,
      react,
    ],
    [
      idle,
      idle1,
      idle2,
      happy,
      talk,
      think,
      wave,
      arguing,
      dance,
      talk1,
      thank,
      greet,
      happyIdle,
      fanIdle,
      nailsIdle,
      react,
    ],
  )
}

export function useVRMAnimations(vrm: VRM) {
  const fbxList = useAllFBX()

  const animationClips = useMemo(
    () =>
      fbxList.map((fbx, i) => {
        const clip = remapMixamoAnimationToVrm(vrm, fbx)
        clip.name = ANIMATIONS[i].name
        return clip
      }),
    [vrm, fbxList],
  )

  const { actions } = useAnimations(animationClips, vrm.scene)

  const { animation } = useControls(
    "VRM",
    {
      animation: {
        options: ["None", ...ANIMATIONS.map((a) => a.name)] as [
          "None",
          ...AnimationName[],
        ],
        value: "None" as "None" | AnimationName,
      },
    },
    { render: () => IS_DEBUG },
  )

  const avatarState = useAvatarStore((s) => s.values)
  const setAnimationPlaying = useAvatarStore((s) => s.setAnimationPlaying)
  const isThinking = useAvatarStore((s) => s.isThinking)
  const isAudioPlaying = useAvatarStore((s) => s.isAudioPlaying)

  const controllerRef = useRef<{
    playOneShot: (name: AnimationName) => void
    playThinking: () => void
    endThinking: () => void
  } | null>(null)

  // Animation controller. Built once `actions` are ready; drives the idle
  // cycle and one-shots through a single crossfade + "finished" listener.
  useEffect(() => {
    const names = Object.keys(actions)
    const first = names.length ? actions[names[0]] : null
    if (!first) return
    const mixer = first.getMixer()

    let mode: "idle" | "oneshot" | "thinking" = "idle"
    let current: AnimationAction | null = null
    let lastIdle: AnimationName | null = null
    let idleTimer: number | null = null

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    const crossfadeTo = (
      action: AnimationAction,
      loop: typeof LoopOnce | typeof LoopRepeat,
      fade: number,
    ) => {
      const prev = current
      // Stop leftover clips from earlier fades. crossFadeTo/fadeOut only ramp
      // weight to 0 — the action keeps *running* in the mixer (advanced every
      // frame) until stopped. Without this they pile up and steadily cost FPS.
      for (const a of Object.values(actions)) {
        if (a && a !== action && a !== prev && a.isRunning()) a.stop()
      }
      action.clampWhenFinished = loop === LoopOnce
      action.loop = loop
      action.reset()
      action.play()
      if (prev && prev !== action) {
        // Synchronised crossfade: keeps the blended weight ~1 throughout so the
        // pose eases from the current animation into the next with no jump/dip.
        prev.crossFadeTo(action, fade, false)
      } else {
        action.fadeIn(fade)
      }
      current = action
    }

    // Idle loops continuously and is swapped for another after a random hold,
    // so the avatar keeps moving instead of clamping on a final frame.
    const playIdle = () => {
      mode = "idle"
      clearIdleTimer()

      // TEMP: random idle cycling disabled to test its perf impact.
      // Flip ENABLE_RANDOM_IDLE back to true to restore.
      if (!ENABLE_RANDOM_IDLE) {
        const action = actions["idle"]
        if (action) crossfadeTo(action, LoopRepeat, IDLE_FADE)
        return
      }

      const name = pickIdle(lastIdle)
      lastIdle = name
      const action = actions[name]
      if (!action) return

      // Special idles (fan/nails gestures) look unnatural looping, so play them
      // once and advance to the next idle when they finish. pickIdle already
      // forbids special-after-special, so a special never repeats. Base idles
      // loop for a random hold to keep the avatar moving.
      if (SPECIAL_IDLE.includes(name)) {
        crossfadeTo(action, LoopOnce, IDLE_FADE)
        return
      }

      crossfadeTo(action, LoopRepeat, IDLE_FADE)
      idleTimer = window.setTimeout(
        () => {
          if (mode === "idle") playIdle()
        },
        IDLE_HOLD_MIN_MS +
          Math.random() * (IDLE_HOLD_MAX_MS - IDLE_HOLD_MIN_MS),
      )
    }

    const playOneShot = (name: AnimationName) => {
      const action = actions[name]
      if (!action) return
      mode = "oneshot"
      clearIdleTimer()
      setAnimationPlaying(true)
      crossfadeTo(action, LoopOnce, ONESHOT_FADE)
    }

    // Loops the "think" pose while a reply is loading. Held until a reply
    // one-shot takes over or endThinking returns to idle.
    const playThinking = () => {
      const action = actions["think"]
      if (!action) return
      mode = "thinking"
      clearIdleTimer()
      crossfadeTo(action, LoopRepeat, ONESHOT_FADE)
    }

    const endThinking = () => {
      if (mode === "thinking") playIdle()
    }

    const onFinished = (
      e: { action: AnimationAction } & Event<"finished", AnimationMixer>,
    ) => {
      if (e.action !== current) return
      // Reached either from a backend/click one-shot or a once-played special
      // idle. If a reply is still loading, resume the think loop; otherwise
      // return to the idle cycle.
      if (mode === "oneshot") setAnimationPlaying(false)
      if (useAvatarStore.getState().isThinking) playThinking()
      else playIdle()
    }

    mixer.addEventListener("finished", onFinished)
    controllerRef.current = { playOneShot, playThinking, endThinking }
    if (useAvatarStore.getState().isThinking) playThinking()
    else playIdle()

    return () => {
      mixer.removeEventListener("finished", onFinished)
      clearIdleTimer()
      controllerRef.current = null
      current?.fadeOut(0.2)
    }
  }, [actions, setAnimationPlaying])

  // Backend-driven one-shots (talk / wave / etc. during replies). Fire when the
  // streamed audio actually starts (isAudioPlaying), not when the reply text
  // arrives, so the gesture stays in sync with the voice. `isThinking` keeps the
  // think loop running in the gap between the two.
  useEffect(() => {
    if (isAudioPlaying && avatarState?.animation) {
      controllerRef.current?.playOneShot(avatarState.animation as AnimationName)
    }
  }, [isAudioPlaying, avatarState?.animation])

  // Loop the think animation while a reply is loading.
  useEffect(() => {
    if (isThinking) controllerRef.current?.playThinking()
    else controllerRef.current?.endThinking()
  }, [isThinking])

  // Debug: selecting an animation in the Leva panel triggers a one-shot.
  useEffect(() => {
    if (!IS_DEBUG || animation === "None") return
    controllerRef.current?.playOneShot(animation)
  }, [animation])

  // Exposed so the avatar can react to being clicked. Ignore clicks while a
  // one-shot (reaction or reply animation) is still playing or the avatar is
  // speaking, so rapid clicks can't restart the reaction before it finishes.
  const playReaction = useCallback(() => {
    // TEMP: click reaction disabled to test its perf impact.
    if (!ENABLE_CLICK_REACTION) return
    const { isAnimationPlaying, isAudioPlaying } = useAvatarStore.getState()
    if (isAnimationPlaying || isAudioPlaying) return
    controllerRef.current?.playOneShot("react")
  }, [])

  return { playReaction }
}
