import { useContext, useLayoutEffect, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  Object3D,
  type Group,
  type InstancedMesh,
  type MeshStandardMaterial,
} from "three";
import { MAP_HEIGHT, MAP_WIDTH, TILES, cityAt, hash, type Tile } from "./map";
import { MotionContext, toWorld } from "./scene";

export interface TileHandlers {
  onTileHover?: (tile: Tile | null) => void;
  onTileClick?: (tile: Tile) => void;
}

const LAND = TILES.filter((tile) => tile.kind !== "water");
const WATER = TILES.filter((tile) => tile.kind === "water");
const DEPOSITS = TILES.filter(
  (tile) => tile.kind === "clay" || tile.kind === "copper",
);

const GROUND_COLORS = {
  grass: "#8dbb5a",
  woods: "#5e8c3c",
  clay: "#c48a5c",
  copper: "#9b9479",
  water: "#4aa6cc",
};
const PAVING = "#ddd2b4";
const CLEAN_WATER = new Color("#4aa6cc");
const DIRTY_WATER = new Color("#80794a");
const TREE_COLORS = ["#3f7a3a", "#4c8a3f", "#356b35", "#5d9746"];
const ROCK_COLORS = {
  clay: ["#b8693f", "#a65a35", "#cf8250"],
  copper: ["#3f9c84", "#c27a3e", "#5aae96"],
};

interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  color: string;
}

const TREES: TreeSpot[] = TILES.filter((tile) => tile.kind === "woods").flatMap(
  ({ x, y }) => {
    const [cx, cz] = toWorld(x, y);
    const count = 2 + Math.round(hash(x, y, 1));
    return Array.from({ length: count }, (_, i) => ({
      x: cx + (hash(x, y, 2 + i) - 0.5) * 0.6,
      z: cz + (hash(x, y, 6 + i) - 0.5) * 0.6,
      scale: 0.75 + hash(x, y, 10 + i) * 0.55,
      color: TREE_COLORS[Math.floor(hash(x, y, 14 + i) * 4)] ?? "#4c8a3f",
    }));
  },
);

const dummy = new Object3D();
const scratch = new Color();
const tint = new Color();

function landColor(tile: Tile): Color {
  const city = cityAt(tile.x, tile.y);
  if (city) {
    return scratch.set(PAVING).lerp(tint.set(city.color), 0.16);
  }
  return scratch
    .set(GROUND_COLORS[tile.kind])
    .offsetHSL(0, 0, (hash(tile.x, tile.y) - 0.5) * 0.07);
}

function placeInstance(
  mesh: InstancedMesh,
  index: number,
  position: [number, number, number],
  scale = 1,
  rotationY = 0,
) {
  dummy.position.set(...position);
  dummy.rotation.set(0, rotationY, 0);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function finishInstances(mesh: InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
}

function tileEvents(tiles: Tile[], { onTileHover, onTileClick }: TileHandlers) {
  if (!onTileHover && !onTileClick) {
    return {};
  }

  const pick = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId === undefined ? undefined : tiles[event.instanceId];

  return {
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const tile = pick(event);
      if (tile) onTileHover?.(tile);
    },
    onPointerOut: () => onTileHover?.(null),
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // A drag that pans the map should not also select a tile.
      if (event.delta > 6) return;
      const tile = pick(event);
      if (tile) onTileClick?.(tile);
    },
  };
}

function Ground(handlers: TileHandlers) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    LAND.forEach((tile, i) => {
      const [x, z] = toWorld(tile.x, tile.y);
      placeInstance(mesh, i, [x, -0.25, z]);
      mesh.setColorAt(i, landColor(tile));
    });
    finishInstances(mesh);
  }, []);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, LAND.length]}
      receiveShadow
      {...tileEvents(LAND, handlers)}
    >
      <boxGeometry args={[0.96, 0.5, 0.96]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

function Water({
  pollution,
  ...handlers
}: { pollution: number } & TileHandlers) {
  const animate = useContext(MotionContext);
  const ref = useRef<InstancedMesh>(null);
  const material = useRef<MeshStandardMaterial>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    WATER.forEach((tile, i) => {
      const [x, z] = toWorld(tile.x, tile.y);
      placeInstance(mesh, i, [x, -0.3, z]);
    });
    finishInstances(mesh);
  }, []);

  useLayoutEffect(() => {
    material.current?.color
      .copy(CLEAN_WATER)
      .lerp(DIRTY_WATER, Math.min(Math.max(pollution, 0), 1));
  }, [pollution]);

  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.3) * 0.015;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, WATER.length]}
      receiveShadow
      {...tileEvents(WATER, handlers)}
    >
      <boxGeometry args={[1, 0.32, 1]} />
      <meshStandardMaterial
        ref={material}
        roughness={0.2}
        metalness={0.1}
        transparent
        opacity={0.9}
      />
    </instancedMesh>
  );
}

function Trees() {
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const trunkMesh = trunks.current;
    const crownMesh = crowns.current;
    if (!trunkMesh || !crownMesh) return;
    TREES.forEach((tree, i) => {
      placeInstance(
        trunkMesh,
        i,
        [tree.x, 0.12 * tree.scale, tree.z],
        tree.scale,
      );
      placeInstance(
        crownMesh,
        i,
        [tree.x, 0.52 * tree.scale, tree.z],
        tree.scale,
        tree.scale * 9,
      );
      crownMesh.setColorAt(i, scratch.set(tree.color));
    });
    finishInstances(trunkMesh);
    finishInstances(crownMesh);
  }, []);

  return (
    <group>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, TREES.length]}
        castShadow
      >
        <cylinderGeometry args={[0.035, 0.055, 0.24, 5]} />
        <meshStandardMaterial color="#6e4b2c" />
      </instancedMesh>
      <instancedMesh
        ref={crowns}
        args={[undefined, undefined, TREES.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[0.25, 0.6, 7]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function Rocks() {
  const ref = useRef<InstancedMesh>(null);
  const count = DEPOSITS.length * 3;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    DEPOSITS.forEach((tile, t) => {
      const [cx, cz] = toWorld(tile.x, tile.y);
      const colors =
        tile.kind === "clay" ? ROCK_COLORS.clay : ROCK_COLORS.copper;
      for (let i = 0; i < 3; i++) {
        const scale = 0.7 + hash(tile.x, tile.y, 20 + i) * 0.6;
        placeInstance(
          mesh,
          t * 3 + i,
          [
            cx + (hash(tile.x, tile.y, 23 + i) - 0.5) * 0.55,
            0.08 * scale,
            cz + (hash(tile.x, tile.y, 26 + i) - 0.5) * 0.55,
          ],
          scale,
          hash(tile.x, tile.y, 29 + i) * Math.PI,
        );
        mesh.setColorAt(t * 3 + i, scratch.set(colors[i] ?? "#999999"));
      }
    });
    finishInstances(mesh);
  }, []);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.17, 0]} />
      <meshStandardMaterial flatShading roughness={0.8} />
    </instancedMesh>
  );
}

const CLOUDS = Array.from({ length: 6 }, (_, i) => ({
  x: -13 + i * 5 + hash(i, 1) * 3,
  y: 5.5 + hash(i, 2) * 1.5,
  z: -8 + hash(i, 3) * 16,
  speed: 0.18 + hash(i, 4) * 0.18,
  scale: 0.55 + hash(i, 5) * 0.35,
}));

function Clouds() {
  const animate = useContext(MotionContext);
  const refs = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    if (!animate) return;
    refs.current.forEach((cloud, i) => {
      const spec = CLOUDS[i];
      if (!cloud || !spec) return;
      // Drift across and wrap around, so clouds keep passing over the map.
      cloud.position.x =
        ((spec.x + clock.elapsedTime * spec.speed + 15) % 30) - 15;
    });
  });

  return (
    <group>
      {CLOUDS.map((cloud, i) => (
        <group
          key={i}
          ref={(group) => {
            refs.current[i] = group;
          }}
          position={[cloud.x, cloud.y, cloud.z]}
          scale={cloud.scale}
        >
          {[
            [0, 0, 0, 0.6],
            [0.55, -0.1, 0.1, 0.45],
            [-0.5, -0.12, -0.05, 0.42],
            [0.1, 0.25, -0.1, 0.4],
          ].map(([x = 0, y = 0, z = 0, r = 0.5], j) => (
            <mesh key={j} position={[x, y, z]} castShadow>
              <icosahedronGeometry args={[r, 0]} />
              <meshStandardMaterial
                color="#ffffff"
                flatShading
                transparent
                opacity={0.85}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Terrain({
  waterPollution,
  ...handlers
}: { waterPollution: number } & TileHandlers) {
  return (
    <group>
      {/* The island the map sits on. */}
      <mesh position={[0, -0.95, 0]} receiveShadow>
        <boxGeometry args={[MAP_WIDTH + 0.3, 1.4, MAP_HEIGHT + 0.3]} />
        <meshStandardMaterial color="#8b6a48" roughness={1} />
      </mesh>
      <mesh position={[0, -1.9, 0]}>
        <boxGeometry args={[MAP_WIDTH - 0.8, 0.6, MAP_HEIGHT - 0.8]} />
        <meshStandardMaterial color="#6d5137" roughness={1} />
      </mesh>
      <Ground {...handlers} />
      <Water pollution={waterPollution} {...handlers} />
      <Trees />
      <Rocks />
      <Clouds />
    </group>
  );
}
