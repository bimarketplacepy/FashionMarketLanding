import type * as THREE from 'three';

const BASE_ASPECT = 16 / 9;
const MAX_VFOV = 90;

export function fitCameraHorizontal(
  camera: THREE.PerspectiveCamera,
  aspect: number,
  baseVerticalFov: number,
): void {
  camera.aspect = aspect;
  if (aspect >= BASE_ASPECT) {
    camera.fov = baseVerticalFov;
  } else {
    const baseHFovRad =
      2 * Math.atan(Math.tan((baseVerticalFov * Math.PI) / 360) * BASE_ASPECT);
    const newVFovRad = 2 * Math.atan(Math.tan(baseHFovRad / 2) / aspect);
    camera.fov = Math.min((newVFovRad * 180) / Math.PI, MAX_VFOV);
  }
  camera.updateProjectionMatrix();
}
