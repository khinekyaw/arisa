import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type ComponentPropsWithoutRef } from "react"

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
  const { playReaction } = useVRMAnimations(currentVrm)
  useVRMLipSync(currentVrm)

  // Optimize VRM
  useEffect(() => {
    const vrm = userData.vrm as VRM | undefined
    if (!vrm) return
    vrmRef.current = vrm
    VRMUtils.removeUnnecessaryVertices(scene)
    VRMUtils.combineSkeletons(scene)
    VRMUtils.combineMorphs(vrm)
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false
      // Skinned-mesh raycasting re-skins every vertex on the CPU per ray test.
      // R3F raycasts on every pointer move (click, hover, zoom-drag), so this
      // tanks FPS. Disable it on the VRM and use a cheap collider for clicks.
      obj.raycast = () => {}
    })

    return () => {
      vrmRef.current = null
    }
  }, [scene, userData])

  useFrame((_, delta) => {
    currentVrm.update(delta)
  })

  return (
    <group rotation={[0, Math.PI, 0]} {...props}>
      <primitive object={scene} />
      {/* Cheap invisible click target — avoids raycasting the skinned mesh. */}
      <mesh
        position={[0, 0.8, 0]}
        onClick={(e) => {
          e.stopPropagation()
          playReaction()
        }}
      >
        <boxGeometry args={[0.7, 1.7, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default Avatar
