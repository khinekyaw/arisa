import { CameraControls, ContactShadows, Environment } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useRef } from "react"

import Avatar from "./Avatar"

function Scene() {
  const controls = useRef<CameraControls>(null)

  return (
    <>
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI}
        minDistance={0.5}
        maxDistance={10}
      />
      <Environment preset="sunset" />
      <directionalLight intensity={2} position={[10, 10, 5]} />
      <directionalLight intensity={1} position={[-10, 10, 5]} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.7} />
      </EffectComposer>
      <group position={[0, -1, 0]}>
        <Avatar path="models/AvatarSample_M.vrm" />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} />
      </group>
    </>
  )
}

export default Scene
