import * as THREE from 'three';

export interface PartAppearance {id: string; kind?: string; color: string}

/** Keep the CAD palette, while distinguishing the physical surfaces. */
export function partMaterial(part: PartAppearance): THREE.MeshStandardMaterial {
  if (part.id === 'acrylic') return new THREE.MeshPhysicalMaterial({
    color: part.color, roughness: .12, metalness: 0, clearcoat: 1,
    clearcoatRoughness: .1, transparent: true, opacity: .3,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const metal = part.kind === 'fastener' || ['motor','drive_nut','hinge_pin','inserts_fixed','inserts_lid'].includes(part.id);
  const board = ['esp','power_board','bridge_board'].includes(part.id);
  return new THREE.MeshStandardMaterial({
    color: part.color, roughness: metal ? .32 : board ? .55 : .72,
    metalness: metal ? .72 : board ? .12 : 0,
    side: THREE.FrontSide,
  });
}

/** Fit every bounding-box corner, including depth, for this camera direction. */
export function fittedDistance(bounds: THREE.Box3, direction: THREE.Vector3, verticalFov: number, aspect: number): number {
  const center = bounds.getCenter(new THREE.Vector3());
  const backwards = direction.clone().normalize();
  const right = new THREE.Vector3(0, 0, 1).cross(backwards).normalize();
  if (right.lengthSq() < 1e-8) right.set(0, 1, 0);
  const up = backwards.clone().cross(right).normalize();
  const vertical = Math.tan(THREE.MathUtils.degToRad(verticalFov) / 2);
  const horizontal = vertical * Math.max(.1, aspect);
  let distance = 80;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        const depth = corner.dot(backwards);
        distance = Math.max(distance, depth + Math.abs(corner.dot(right)) * 1.22 / horizontal,
          depth + Math.abs(corner.dot(up)) * 1.22 / vertical);
      }
    }
  }
  return distance;
}
