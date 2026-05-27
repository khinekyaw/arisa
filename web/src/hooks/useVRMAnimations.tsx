import { VRM } from "@pixiv/three-vrm"
import { useAnimations, useFBX } from "@react-three/drei"
import { useControls } from "leva"
import { useEffect, useMemo } from "react"

import { useAvatarStore } from "@/store/avatarStore"
import { AnimationAction, AnimationMixer, LoopOnce, type Event } from "three"
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm"

const IS_DEBUG = import.meta.env.VITE_DEBUG === 'true'

const ANIMATIONS = [
  { name: "idle", path: "/animations/idle_2.fbx" },
  { name: "idle_1", path: "/animations/idle.fbx" },
  { name: "happy", path: "/animations/happy.fbx" },
  { name: "talk", path: "/animations/talking.fbx" },
  { name: "think", path: "/animations/thinking.fbx" },
  { name: "wave", path: "/animations/waving.fbx" },
  { name: "arguing", path: "/animations/arguing.fbx" },
  { name: "dance", path: "/animations/snake_hip_hop_dance.fbx" },
  { name: "talk_1", path: "/animations/talking_1.fbx" },
  { name: "thank", path: "/animations/thankful.fbx" },
  { name: "greet", path: "/animations/greeting.fbx" },
] as const

type AnimationName = (typeof ANIMATIONS)[number]["name"]

function useAllFBX() {
  const idle = useFBX(ANIMATIONS[0].path)
  const idle1 = useFBX(ANIMATIONS[1].path)
  const happy = useFBX(ANIMATIONS[2].path)
  const talk = useFBX(ANIMATIONS[3].path)
  const think = useFBX(ANIMATIONS[4].path)
  const wave = useFBX(ANIMATIONS[5].path)
  const arguing = useFBX(ANIMATIONS[6].path)
  const dance = useFBX(ANIMATIONS[7].path)
  const talk1 = useFBX(ANIMATIONS[8].path)
  const thank = useFBX(ANIMATIONS[9].path)
  const greet = useFBX(ANIMATIONS[10].path)
  return useMemo(
    () => [idle, idle1, happy, talk, think, wave, arguing, dance, talk1, thank, greet],
    [idle, idle1, happy, talk, think, wave, arguing, dance, talk1, thank, greet],
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
        value: "idle" as "None" | AnimationName,
      },
    },
    { render: () => IS_DEBUG },
  )

  const avatarState = useAvatarStore((s) => s.values)
  const setAnimationPlaying = useAvatarStore((s) => s.setAnimationPlaying)
  const isAnimationPlaying = useAvatarStore((s) => s.isAnimationPlaying)

  useEffect(() => {
    if (avatarState?.animation) {
      const action = actions[avatarState.animation]
      if (!action) return

      const mixer = action.getMixer()

      const onFinished = (
        e: {
          action: AnimationAction
          direction: number
        } & Event<"finished", AnimationMixer>,
      ) => {
        if (e.action === action) {
          action.fadeOut(0.4)
          setAnimationPlaying(false)
        }
      }

      mixer.addEventListener("finished", onFinished)
      // eslint-disable-next-line react-hooks/immutability
      action.clampWhenFinished = true
      action.loop = LoopOnce
      action.reset().fadeIn(0.4).play()
      setAnimationPlaying(true)

      return () => {
        mixer.removeEventListener("finished", onFinished)
        // action.fadeOut(0.4)
      }
    }
  }, [animation, actions, avatarState, setAnimationPlaying])

  useEffect(() => {
    if (animation === "None" || isAnimationPlaying) return
    const action = actions[animation]
    action?.reset().fadeIn(0.4).play()
    return () => {
      action?.fadeOut(0.4)
    }
  }, [isAnimationPlaying, actions, animation])
}
