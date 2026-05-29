import {
  CameraControls,
  ContactShadows,
  Environment,
  Stats,
} from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useRef } from "react"

import Avatar from "./Avatar"

const IS_DEBUG = import.meta.env.VITE_DEBUG === "true"

function Scene() {
  const controls = useRef<CameraControls>(null)

  return (
    <>
      {IS_DEBUG && <Stats />}
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI/1.8}
        minDistance={0.5}
        maxDistance={10}
      />
      <Environment preset="sunset" />
      <directionalLight intensity={1.5} position={[10, 10, 5]} />
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
