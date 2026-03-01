import { CameraControls, ContactShadows, Environment } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { useRef } from "react"
import Avatar from "./Avatar"
// import * as THREE from "three"

function Scene() {
  const controls = useRef<CameraControls>(null)

  return (
    <Canvas shadows camera={{ position: [0, 0.1, 2], fov: 30 }}>
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
          path="models/avatar.glb"
          position={[0, 0, 0]}
          rotation={[0, Math.PI, 0]}
        />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} />
      </group>
    </Canvas>
  )
}

export default Scene
