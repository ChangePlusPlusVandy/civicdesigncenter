import { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  Object3D,
  type Group,
  type InstancedMesh,
  type MeshStandardMaterial,
} from "three";
import {
  COMMONS,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILES,
  cityAt,
  neighborOfKind,
  type CommonsView,
  type Tile,
} from "@cs/idle";
import { Ball } from "./parts";
import { MotionContext, hash, toWorld } from "./scene";

export interface TileHandlers {
  onTileHover?: (tile: Tile | null) => void;
  onTileClick?: (tile: Tile) => void;
}

const LAND = TILES.filter((tile) => tile.kind !== "water");
const WATER = TILES.filter((tile) => tile.kind === "water");
const DEPOSITS = TILES.filter(
  (tile) => tile.kind === "clay" || tile.kind === "copper",
);

const GROUND = {
  grass: "#8dbb5a",
  woods: "#5e8c3c",
  clay: "#c48a5c",
  copper: "#9b9479",
  water: "#4aa6cc",
};
const SAND = "#d8c693";
const CLEAN_WATER = new Color("#4aa6cc");
const DIRTY_WATER = new Color("#7d7448");
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
  commons: "westWoods" | "eastWoods";
  // Trees disappear in this order as the woods are cut down.
  rank: number;
}

const TREES: TreeSpot[] = TILES.filter((tile) => tile.kind === "woods").flatMap(
  ({ x, y, commons }) => {
    const [cx, cz] = toWorld(x, y);
    const count = 2 + Math.round(hash(x, y, 1));
    return Array.from({ length: count }, (_, i) => ({
      x: cx + (hash(x, y, 2 + i) - 0.5) * 0.6,
      z: cz + (hash(x, y, 6 + i) - 0.5) * 0.6,
      scale: 0.75 + hash(x, y, 10 + i) * 0.55,
      color: TREE_COLORS[Math.floor(hash(x, y, 14 + i) * 4)] ?? "#4c8a3f",
      commons: commons === "eastWoods" ? "eastWoods" : "westWoods",
      rank: hash(x, y, 18 + i),
    }));
  },
);

const dummy = new Object3D();
const scratch = new Color();
const tint = new Color();

function landColor(tile: Tile): Color {
  const city = cityAt(tile.x, tile.y);
  const base = scratch.set(GROUND[tile.kind]);
  // Grass along the river fades toward a sandy bank.
  if (tile.kind === "grass" && neighborOfKind(tile.x, tile.y, "water")) {
    base.lerp(tint.set(SAND), 0.4);
  }
  if (city) base.lerp(tint.set(city.color), 0.12).offsetHSL(0, -0.05, 0.05);
  return base.offsetHSL(0, 0, (hash(tile.x, tile.y) - 0.5) * 0.05);
}

function place(
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

function finish(mesh: InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function tileEvents(tiles: Tile[], { onTileHover, onTileClick }: TileHandlers) {
  if (!onTileHover && !onTileClick) return {};
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
      place(mesh, i, [x, -0.25, z]);
      mesh.setColorAt(i, landColor(tile));
    });
    finish(mesh);
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, LAND.length]}
      receiveShadow
      {...tileEvents(LAND, handlers)}
    >
      <boxGeometry args={[1, 0.5, 1]} />
      <meshStandardMaterial roughness={0.95} flatShading />
    </instancedMesh>
  );
}

function Water({ murk, ...handlers }: { murk: number } & TileHandlers) {
  const animate = useContext(MotionContext);
  const ref = useRef<InstancedMesh>(null);
  const material = useRef<MeshStandardMaterial>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    WATER.forEach((tile, i) => {
      const [x, z] = toWorld(tile.x, tile.y);
      place(mesh, i, [x, -0.3, z]);
    });
    finish(mesh);
  }, []);

  useLayoutEffect(() => {
    material.current?.color
      .copy(CLEAN_WATER)
      .lerp(DIRTY_WATER, Math.min(Math.max(murk, 0), 1));
  }, [murk]);

  useFrame(({ clock }) => {
    if (animate && ref.current) {
      ref.current.position.y = Math.sin(clock.elapsedTime * 1.3) * 0.015;
    }
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
        opacity={0.92}
      />
    </instancedMesh>
  );
}

// Trees thin out as their woods are cut, in 10% steps.
function Trees({
  fullness,
}: {
  fullness: Record<"westWoods" | "eastWoods", number>;
}) {
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  const west = Math.round(fullness.westWoods * 10) / 10;
  const east = Math.round(fullness.eastWoods * 10) / 10;

  useLayoutEffect(() => {
    const trunkMesh = trunks.current;
    const crownMesh = crowns.current;
    if (!trunkMesh || !crownMesh) return;
    TREES.forEach((tree, i) => {
      const share = tree.commons === "westWoods" ? west : east;
      const scale = tree.rank < share + 0.05 ? tree.scale : 0;
      place(trunkMesh, i, [tree.x, 0.12 * tree.scale, tree.z], scale);
      place(
        crownMesh,
        i,
        [tree.x, 0.52 * tree.scale, tree.z],
        scale,
        tree.scale * 9,
      );
      crownMesh.setColorAt(i, scratch.set(tree.color));
    });
    finish(trunkMesh);
    finish(crownMesh);
  }, [west, east]);

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
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    DEPOSITS.forEach((tile, t) => {
      const [cx, cz] = toWorld(tile.x, tile.y);
      const colors =
        tile.kind === "clay" ? ROCK_COLORS.clay : ROCK_COLORS.copper;
      for (let i = 0; i < 3; i++) {
        const scale = 0.7 + hash(tile.x, tile.y, 20 + i) * 0.6;
        place(
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
    finish(mesh);
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, DEPOSITS.length * 3]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.17, 0]} />
      <meshStandardMaterial flatShading roughness={0.8} />
    </instancedMesh>
  );
}

// Only on the join-page backdrop: soft clouds drifting high above the map.
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({
  x: -13 + i * 6 + hash(i, 1) * 3,
  y: 7 + hash(i, 2),
  z: -8 + hash(i, 3) * 16,
  speed: 0.2 + hash(i, 4) * 0.15,
  scale: 0.55 + hash(i, 5) * 0.3,
}));

export function Clouds() {
  const animate = useContext(MotionContext);
  const refs = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    if (!animate) return;
    refs.current.forEach((cloud, i) => {
      const spec = CLOUDS[i];
      if (cloud && spec) {
        cloud.position.x =
          ((spec.x + clock.elapsedTime * spec.speed + 15) % 30) - 15;
      }
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
          {(
            [
              [0, 0, 0, 0.6],
              [0.55, -0.1, 0.1, 0.45],
              [-0.5, -0.12, -0.05, 0.42],
            ] as const
          ).map(([x, y, z, r], j) => (
            <Ball
              key={j}
              radius={r}
              detail={0}
              position={[x, y, z]}
              color="#ffffff"
              opacity={0.85}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

export function Terrain({
  commons,
  ...handlers
}: { commons: CommonsView[] } & TileHandlers) {
  const river = commons.find((c) => c.id === "river");
  const fullness = useMemo(() => {
    const share = (id: "westWoods" | "eastWoods") =>
      (commons.find((c) => c.id === id)?.stocks.wood ?? 0) /
      (COMMONS[id].stocks.wood?.cap ?? 1);
    return { westWoods: share("westWoods"), eastWoods: share("eastWoods") };
  }, [commons]);

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
      <Water murk={(river?.pollution ?? 0) / 40} {...handlers} />
      <Trees fullness={fullness} />
      <Rocks />
    </group>
  );
}
