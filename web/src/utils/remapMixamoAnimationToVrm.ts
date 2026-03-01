import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm"
import * as THREE from "three"

import { mixamoVRMRigMap } from "./mixamoVRMRigMap.js"

/**
 * Remaps Mixamo animation tracks to a VRM compatible AnimationClip.
 * @param vrm - The target VRM object.
 * @param asset - The source Mixamo GLTF/Object3D asset containing animations.
 */
export function remapMixamoAnimationToVrm(
  vrm: VRM,
  asset: (THREE.Group | THREE.Object3D) & {
    animations?: THREE.AnimationClip[]
  },
): THREE.AnimationClip {
  const foundClip = THREE.AnimationClip.findByName(
    asset.animations as THREE.AnimationClip[],
    "mixamo.com",
  )?.clone()
  if (!foundClip) {
    throw new Error(
      'Could not find animation clip named "mixamo.com" in the asset.',
    )
  }
  const clip = foundClip.clone() // extract the AnimationClip

  const tracks: THREE.KeyframeTrack[] = [] // KeyframeTracks compatible with VRM

  const restRotationInverse = new THREE.Quaternion()
  const parentRestWorldRotation = new THREE.Quaternion()
  const _quatA = new THREE.Quaternion()
  const _vec3 = new THREE.Vector3()

  // Adjust with reference to hips height.
  const mixamoHips = asset.getObjectByName("mixamorigHips")
  if (!mixamoHips) {
    throw new Error("Could not find mixamorigHips in the source asset.")
  }

  const motionHipsHeight = mixamoHips.position.y

  // Get VRM Hips height safely
  const vrmHipsNode = vrm.humanoid?.getNormalizedBoneNode("hips")
  const vrmHipsY = vrmHipsNode ? vrmHipsNode.getWorldPosition(_vec3).y : 0
  const vrmRootY = vrm.scene.getWorldPosition(new THREE.Vector3()).y
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY)

  const hipsPositionScale = vrmHipsHeight / motionHipsHeight

  clip.tracks.forEach((track: THREE.KeyframeTrack) => {
    const trackSplitted = track.name.split(".")
    const mixamoRigName = trackSplitted[0]
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName] as
      | VRMHumanBoneName
      | undefined

    if (!vrmBoneName) return

    // VRM 0.x and 1.x handle bone nodes slightly differently
    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)
    const vrmNodeName = vrmNode?.name
    const mixamoRigNode = asset.getObjectByName(mixamoRigName)

    if (vrmNodeName != null && mixamoRigNode) {
      const propertyName = trackSplitted[1]

      // Store rotations of rest-pose.
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert()
      mixamoRigNode.parent?.getWorldQuaternion(parentRestWorldRotation)

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        // We work on a copy of the values to avoid mutating the original clip prematurely
        const values = track.values.slice()

        for (let i = 0; i < values.length; i += 4) {
          _quatA.fromArray(values, i)

          // Apply coordinate transformation: Parent Rest * Track * Inverse Rest
          _quatA
            .premultiply(parentRestWorldRotation)
            .multiply(restRotationInverse)

          _quatA.toArray(values, i)
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            Array.from(values).map((v, i) =>
              vrm.meta?.metaVersion === "0" && i % 2 === 0 ? -v : v,
            ),
          ),
        )
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const value = Array.from(track.values).map(
          (v, i) =>
            (vrm.meta?.metaVersion === "0" && i % 3 !== 1 ? -v : v) *
            hipsPositionScale,
        )

        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            value,
          ),
        )
      }
    }
  })

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks)
}
