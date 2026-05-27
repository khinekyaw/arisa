import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react"
import * as THREE from "three"

import { useVRMLipSync } from "@/hooks/useVRMLipSync"
import { lerp } from "three/src/math/MathUtils.js"
import { useVRMAnimations } from "../hooks/useVRMAnimations"
import { useVRMBlink } from "../hooks/useVRMBlink"
import { useVRMExpressions } from "../hooks/useVRMExpressions"
import { useVRMLookAt } from "../hooks/useVRMLookAt"

interface AvatarProps extends ComponentPropsWithoutRef<"group"> {
  path: string
}

const ENTRY_START_Y = -2 // starting Y position (below screen)
const ENTRY_TARGET_Y = 0 // final Y position
const ENTRY_SPEED = 2 // higher = faster spring

const Avatar = ({ path = "models/avatar.glb", ...props }: AvatarProps) => {
  const vrmRef = useRef<VRM | null>(null)
  const groupRef = useRef<THREE.Group>(null)
  const currentYRef = useRef(ENTRY_START_Y)
  const currentRotYRef = useRef(0)
  const [isLoaded, setIsLoaded] = useState(false)

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

    // Reset entry position and trigger animation
    currentRotYRef.current = 0
    currentYRef.current = ENTRY_START_Y
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true)
    // console.log("effect")

    return () => {
      vrmRef.current = null
      setIsLoaded(false)
    }
  }, [scene, userData])

  useFrame((_, delta) => {
    // VRM update tick
    currentVrm.update(delta)

    // Entry animation: spring lerp Y toward target
    if (groupRef.current && isLoaded) {
      const target = ENTRY_TARGET_Y
      const nextY = lerp(currentYRef.current, target, delta * ENTRY_SPEED)
      const nextRotY = lerp(
        currentRotYRef.current,
        Math.PI,
        delta * ENTRY_SPEED,
      )
      currentYRef.current = nextY
      groupRef.current.position.y = nextY
      currentRotYRef.current = nextRotY
      groupRef.current.rotation.y = nextRotY
    }
  })

  return (
    <group ref={groupRef} position={[0, ENTRY_START_Y, 0]} {...props}>
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
