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

// Calm base idles play most of the time. The expressive "special" idles appear
// only occasionally (~SPECIAL_IDLE_CHANCE) and never twice in a row.
const BASE_IDLE: AnimationName[] = ["idle", "idle_1", "idle_2"]
const SPECIAL_IDLE: AnimationName[] = ["happy_idle", "fan_idle", "nails_idle"]
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

  const controllerRef = useRef<{
    playOneShot: (name: AnimationName) => void
  } | null>(null)

  // Animation controller. Built once `actions` are ready; drives the idle
  // cycle and one-shots through a single crossfade + "finished" listener.
  useEffect(() => {
    const names = Object.keys(actions)
    const first = names.length ? actions[names[0]] : null
    if (!first) return
    const mixer = first.getMixer()

    let mode: "idle" | "oneshot" = "idle"
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
      const name = pickIdle(lastIdle)
      lastIdle = name
      const action = actions[name]
      if (action) crossfadeTo(action, LoopRepeat, IDLE_FADE)
      clearIdleTimer()
      idleTimer = window.setTimeout(
        () => {
          if (mode === "idle") playIdle()
        },
        IDLE_HOLD_MIN_MS + Math.random() * (IDLE_HOLD_MAX_MS - IDLE_HOLD_MIN_MS),
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

    const onFinished = (
      e: { action: AnimationAction } & Event<"finished", AnimationMixer>,
    ) => {
      if (e.action !== current || mode !== "oneshot") return
      setAnimationPlaying(false)
      playIdle()
    }

    mixer.addEventListener("finished", onFinished)
    controllerRef.current = { playOneShot }
    playIdle()

    return () => {
      mixer.removeEventListener("finished", onFinished)
      clearIdleTimer()
      controllerRef.current = null
      current?.fadeOut(0.2)
    }
  }, [actions, setAnimationPlaying])

  // Backend-driven one-shots (talk / wave / etc. during replies).
  useEffect(() => {
    if (avatarState?.animation) {
      controllerRef.current?.playOneShot(avatarState.animation as AnimationName)
    }
  }, [avatarState])

  // Debug: selecting an animation in the Leva panel triggers a one-shot.
  useEffect(() => {
    if (!IS_DEBUG || animation === "None") return
    controllerRef.current?.playOneShot(animation)
  }, [animation])

  // Exposed so the avatar can react to being clicked.
  const playReaction = useCallback(() => {
    controllerRef.current?.playOneShot("react")
  }, [])

  return { playReaction }
}
