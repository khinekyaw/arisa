import { VRM } from "@pixiv/three-vrm"
import { useFrame, useThree } from "@react-three/fiber"
import { useRef } from "react"
import * as THREE from "three"
import { lerp } from "three/src/math/MathUtils.js"

export function useVRMLookAt(vrm: VRM | null) {
  const camera = useThree((state) => state.camera)
  const lookAtDestination = useRef(new THREE.Vector3(0, 0, 1))

  useFrame((_, delta) => {
    if (!vrm?.lookAt) return

    const headNode = vrm.humanoid.getNormalizedBoneNode("head")
    if (!headNode) return

    const cameraPos = camera.position
    const xPos = Math.abs(cameraPos.x) <= 0.8 ? cameraPos.x : 0
    const yPos = Math.abs(cameraPos.y) <= 0.8 ? cameraPos.y : 0
    const zPos = Math.abs(cameraPos.z) <= 3 ? cameraPos.z : 1

    lookAtDestination.current.set(
      lerp(lookAtDestination.current.x, xPos, delta * 10),
      lerp(lookAtDestination.current.y, yPos, delta * 10),
      lerp(lookAtDestination.current.z, zPos, delta * 10),
    )

    vrm.lookAt.lookAt(lookAtDestination.current)
  })
}
