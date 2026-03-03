import { CameraControls, ContactShadows, Environment } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useRef } from "react"
// import * as THREE from "three"

import Avatar from "./Avatar"

function Scene() {
  const controls = useRef<CameraControls>(null)

  return (
    <>
      {/* Controls */}
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI}
        minDistance={0.5}
        maxDistance={10}
      />
      {/* Background */}
      {/* <mesh scale={100}>
        <sphereGeometry />
        <meshBasicMaterial side={THREE.BackSide}>
          <GradientTexture
            stops={[0, 0.5, 1]}
            colors={["#f8f5ff", "#b7a9d9", "#b7a9d9"]}
            size={1024}
          />
        </meshBasicMaterial>
      </mesh> */}
      {/* Lighting */}
      <Environment preset="sunset" />
      <directionalLight intensity={2} position={[10, 10, 5]} />
      <directionalLight intensity={1} position={[-10, 10, 5]} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.7} />
      </EffectComposer>
      {/* Avatar */}
      <group position={[0, -1.15, 0]}>
        <Avatar
          path="models/maid.glb"
          // rotation={[0, Math.PI, 0]}
        />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} />
      </group>
    </>
  )
}

export default Scene
