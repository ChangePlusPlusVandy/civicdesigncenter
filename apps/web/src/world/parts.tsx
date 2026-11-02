// Small building blocks for the low-poly models. Geometries and materials are
// cached by their parameters, so hundreds of pieces share a handful of GPU
// objects instead of each mesh creating its own.

import { forwardRef } from "react";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Mesh,
} from "three";

type Vec3 = [number, number, number];

const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, MeshStandardMaterial>();

function geometry(key: string, make: () => BufferGeometry): BufferGeometry {
  let cached = geometries.get(key);
  if (!cached) {
    cached = make();
    geometries.set(key, cached);
  }
  return cached;
}

function material(
  color: string,
  options: { flat?: boolean; emissive?: string; opacity?: number } = {},
): MeshStandardMaterial {
  const key = `${color}|${options.flat ? 1 : 0}|${options.emissive ?? ""}|${options.opacity ?? 1}`;
  let cached = materials.get(key);
  if (!cached) {
    cached = new MeshStandardMaterial({
      color,
      flatShading: options.flat ?? true,
      roughness: 0.85,
      emissive: options.emissive ?? "#000000",
      emissiveIntensity: options.emissive ? 1.2 : 0,
      transparent: options.opacity !== undefined,
      opacity: options.opacity ?? 1,
      depthWrite: options.opacity === undefined,
    });
    materials.set(key, cached);
  }
  return cached;
}

interface PartProps {
  position?: Vec3;
  rotation?: Vec3;
  color: string;
  shadow?: boolean;
  emissive?: string;
  opacity?: number;
}

// A box whose bottom sits at position.y (easier to stack than centered boxes).
export const Box = forwardRef<Mesh, PartProps & { size: Vec3 }>(function Box(
  {
    size,
    position = [0, 0, 0],
    rotation,
    color,
    shadow = true,
    emissive,
    opacity,
  },
  ref,
) {
  const [w, h, d] = size;
  return (
    <mesh
      ref={ref}
      geometry={geometry(`box${w},${h},${d}`, () => new BoxGeometry(w, h, d))}
      material={material(color, { emissive, opacity })}
      position={[position[0], position[1] + h / 2, position[2]]}
      rotation={rotation}
      castShadow={shadow}
      receiveShadow
    />
  );
});

// A pyramid roof (4-sided cone turned to line up with boxes).
export function Roof({
  width,
  height,
  position = [0, 0, 0],
  color,
}: {
  width: number;
  height: number;
  position?: Vec3;
  color: string;
}) {
  const radius = (width / 2) * Math.SQRT2;
  return (
    <mesh
      geometry={geometry(
        `roof${radius},${height}`,
        () => new ConeGeometry(radius, height, 4),
      )}
      material={material(color)}
      position={[position[0], position[1] + height / 2, position[2]]}
      rotation={[0, Math.PI / 4, 0]}
      castShadow
    />
  );
}

export const Cone = forwardRef<
  Mesh,
  PartProps & { radius: number; height: number; sides?: number }
>(function Cone(
  {
    radius,
    height,
    sides = 6,
    position = [0, 0, 0],
    rotation,
    color,
    shadow = true,
    emissive,
  },
  ref,
) {
  return (
    <mesh
      ref={ref}
      geometry={geometry(
        `cone${radius},${height},${sides}`,
        () => new ConeGeometry(radius, height, sides),
      )}
      material={material(color, { emissive })}
      position={[position[0], position[1] + height / 2, position[2]]}
      rotation={rotation}
      castShadow={shadow}
    />
  );
});

export const Cylinder = forwardRef<
  Mesh,
  PartProps & { radius: number; height: number; top?: number; sides?: number }
>(function Cylinder(
  {
    radius,
    top,
    height,
    sides = 8,
    position = [0, 0, 0],
    rotation,
    color,
    shadow = true,
    emissive,
  },
  ref,
) {
  return (
    <mesh
      ref={ref}
      geometry={geometry(
        `cyl${top ?? radius},${radius},${height},${sides}`,
        () => new CylinderGeometry(top ?? radius, radius, height, sides),
      )}
      material={material(color, { emissive })}
      position={[position[0], position[1] + height / 2, position[2]]}
      rotation={rotation}
      castShadow={shadow}
      receiveShadow
    />
  );
});

export const Ball = forwardRef<
  Mesh,
  PartProps & { radius: number; detail?: number }
>(function Ball(
  { radius, detail = 1, position = [0, 0, 0], color, shadow = true, opacity },
  ref,
) {
  return (
    <mesh
      ref={ref}
      geometry={geometry(
        `ball${radius},${detail}`,
        () => new SphereGeometry(radius, 6 + detail * 4, 4 + detail * 3),
      )}
      material={material(color, { opacity })}
      position={position}
      castShadow={shadow}
    />
  );
});

export function Rock({
  radius,
  position = [0, 0, 0],
  color,
}: {
  radius: number;
  position?: Vec3;
  color: string;
}) {
  return (
    <mesh
      geometry={geometry(
        `rock${radius}`,
        () => new DodecahedronGeometry(radius, 0),
      )}
      material={material(color)}
      position={[position[0], position[1] + radius * 0.7, position[2]]}
      castShadow
    />
  );
}
