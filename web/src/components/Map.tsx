import { useGLTF } from "@react-three/drei"
import { useEffect, type ComponentPropsWithoutRef } from "react"
import { Mesh, MeshStandardMaterial } from "three"

const MAP_PATH = "models/neon_palm_tree_base.glb"

// The model ships with very strong emissive neon that blows out under bloom.
// Clamp it to a calmer glow (absolute value keeps this idempotent across the
// shared, cached GLTF scene).
const EMISSIVE_INTENSITY = 0.6

const Map = (props: ComponentPropsWithoutRef<"group">) => {
  const { scene } = useGLTF(MAP_PATH)

  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        if (mat instanceof MeshStandardMaterial) {
          mat.emissiveIntensity = EMISSIVE_INTENSITY
        }
      }
    })
  }, [scene])

  return (
    <group {...props}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(MAP_PATH)

export default Map
