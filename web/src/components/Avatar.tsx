import {
  VRM,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {
  useEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
} from "react"
import { Group, Mesh, Object3D, Vector3 } from "three"

import { useVRMLipSync } from "@/hooks/useVRMLipSync"
import { useVRMAnimations } from "../hooks/useVRMAnimations"
import { useVRMBlink } from "../hooks/useVRMBlink"
import { useVRMExpressions } from "../hooks/useVRMExpressions"
import { useVRMLookAt } from "../hooks/useVRMLookAt"

const IS_DEBUG = import.meta.env.VITE_DEBUG === "true"

interface AvatarProps extends ComponentPropsWithoutRef<"group"> {
  path: string
}

const Avatar = ({ path = "models/avatar.glb", ...props }: AvatarProps) => {
  const vrmRef = useRef<VRM | null>(null)
  const groupRef = useRef<Group>(null)
  const colliderRef = useRef<Mesh>(null)
  const headBoneRef = useRef<Object3D | null>(null)
  const headWorld = useRef(new Vector3())
  const springReset = useRef(false)

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

    // Cache the head bone so the click collider can follow it each frame.
    headBoneRef.current =
      vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Head) ??
      vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head) ??
      null

    // Re-arm the one-time spring-bone reset for this freshly loaded model.
    springReset.current = false

    return () => {
      vrmRef.current = null
      headBoneRef.current = null
    }
  }, [scene, userData])

  useFrame((_, delta) => {
    // Clamp the step so a large first/hitched frame can't make the spring-bone
    // hair physics explode.
    currentVrm.update(Math.min(delta, 1 / 30))

    // The hair spring bones can still whip on the very first frame (initial
    // transform jump). Discard that startup step by resetting them once, before
    // it ever renders.
    if (!springReset.current) {
      currentVrm.springBoneManager?.reset()
      springReset.current = true
    }

    // Keep the head-only click target glued to the animated head bone. Cheap:
    // one bone world-position read + a transform — far less than the skinned-
    // mesh raycasting we already disabled.
    const head = headBoneRef.current
    const collider = colliderRef.current
    const group = groupRef.current
    if (head && collider && group) {
      const local = group.worldToLocal(head.getWorldPosition(headWorld.current))
      collider.position.set(local.x, local.y + 0.08, local.z)
    }
  })

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]} {...props}>
      <primitive object={scene} />
      {/* Cheap invisible head-only click target — a single box, so it avoids
          the per-ray CPU cost of raycasting the skinned mesh. */}
      <mesh
        ref={colliderRef}
        position={[0, 1.4, 0]}
        onClick={(e) => {
          e.stopPropagation()
          playReaction()
        }}
      >
        <boxGeometry args={[0.19, 0.24, 0.19]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={IS_DEBUG ? 0.35 : 0}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default Avatar
