import {
  AdaptiveDpr,
  CameraControls,
  ContactShadows,
  Environment,
  Stats,
} from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useRef } from "react"

import Avatar from "./Avatar"

const IS_DEBUG = import.meta.env.VITE_DEBUG === "true"

function Scene() {
  const controls = useRef<CameraControls>(null)
  // Temporarily lower render resolution while the camera is being moved/zoomed,
  // then restore full quality once it settles (paired with <AdaptiveDpr />).
  const regress = useThree((s) => s.performance.regress)

  return (
    <>
      {IS_DEBUG && <Stats />}
      <AdaptiveDpr />
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI}
        minDistance={0.5}
        maxDistance={10}
        onChange={() => regress()}
      />
      <Environment preset="sunset" />
      <directionalLight intensity={2} position={[10, 10, 5]} />
      <directionalLight intensity={1} position={[-10, 10, 5]} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.7} />
      </EffectComposer>
      <group position={[0, -1, 0]}>
        <Avatar path="models/AvatarSample_M.vrm" />
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.5}
          resolution={256}
          frames={60}
        />
      </group>
    </>
  )
}

export default Scene
