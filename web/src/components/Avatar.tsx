import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {
  useEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
} from "react"

import { useVRMLipSync } from "@/hooks/useVRMLipSync"
import { useVRMAnimations } from "../hooks/useVRMAnimations"
import { useVRMBlink } from "../hooks/useVRMBlink"
import { useVRMExpressions } from "../hooks/useVRMExpressions"
import { useVRMLookAt } from "../hooks/useVRMLookAt"

interface AvatarProps extends ComponentPropsWithoutRef<"group"> {
  path: string
}

const Avatar = ({ path = "models/avatar.glb", ...props }: AvatarProps) => {
  const vrmRef = useRef<VRM | null>(null)
  const { scene, userData } = useGLTF(path, undefined, undefined, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as never)
  })
  const currentVrm = useMemo(() => userData.vrm as VRM, [userData.vrm])

  // Hooks
  useVRMBlink(currentVrm)
  useVRMExpressions(currentVrm)
  useVRMLookAt(currentVrm)
  useVRMAnimations(currentVrm)
  useVRMLipSync(currentVrm)

  // Optimize VRM
  // console.log("rerender")
  useEffect(() => {
    const vrm = userData.vrm as VRM | undefined
    if (!vrm) return
    vrmRef.current = vrm
    VRMUtils.removeUnnecessaryVertices(scene)
    VRMUtils.combineSkeletons(scene)
    VRMUtils.combineMorphs(vrm)
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false
    })
    return () => {
      vrmRef.current = null
    }
  }, [scene, userData])

  // VRM update tick
  useFrame((_, delta) => {
    currentVrm.update(delta)
  })

  return (
    <group {...props}>
      <primitive object={scene} />
    </group>
  )
}

export default Avatar
