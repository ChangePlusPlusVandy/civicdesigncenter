import { useContext, useRef, type ReactNode } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import {
  CITIES,
  hash,
  isProduction,
  tileAt,
  type City,
  type PlacedBuilding,
} from "./map";
import { MotionContext, toWorld } from "./scene";

const WALL = "#f3ead6";
const ORE_COLORS = { "clay-mine": "#c06f43", "copper-mine": "#3f9c84" };

function Smoke({
  position,
  color = "#9b958d",
  size = 1,
}: {
  position: [number, number, number];
  color?: string;
  size?: number;
}) {
  const animate = useContext(MotionContext);
  const puffs = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    puffs.current.forEach((puff, i) => {
      if (!puff) return;
      const t = animate
        ? (clock.elapsedTime * 0.35 + i / puffs.current.length) % 1
        : i / puffs.current.length;
      puff.position.set(t * 0.3, t * 1.1, t * 0.1);
      // Grow as it rises, then shrink away near the top.
      puff.scale.setScalar(
        Math.max((0.06 + t * 0.15) * (1 - t ** 4) * size, 0.001),
      );
    });
  });

  return (
    <group position={position}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            puffs.current[i] = mesh;
          }}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.75}
            flatShading
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Roof({
  color,
  radius,
  height,
  y,
}: {
  color: string;
  radius: number;
  height: number;
  y: number;
}) {
  return (
    <mesh castShadow position={[0, y + height / 2, 0]} rotation-y={Math.PI / 4}>
      <coneGeometry args={[radius, height, 4]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

function Houses({ color, seed }: { color: string; seed: number }) {
  return (
    <>
      {[
        [-0.19, -0.15],
        [0.2, 0.17],
      ].map(([x = 0, z = 0], i) => {
        const height = 0.26 + hash(seed, i, 3) * 0.16;
        return (
          <group
            key={i}
            position={[x, 0, z]}
            rotation-y={hash(seed, i, 4) > 0.5 ? 0 : Math.PI / 2}
          >
            <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
              <boxGeometry args={[0.34, height, 0.3]} />
              <meshStandardMaterial color={WALL} />
            </mesh>
            <mesh position={[0, 0.07, 0.151]}>
              <boxGeometry args={[0.07, 0.12, 0.01]} />
              <meshStandardMaterial color="#6b4a2e" />
            </mesh>
            <Roof color={color} radius={0.27} height={0.22} y={height} />
          </group>
        );
      })}
    </>
  );
}

function Flag({ color }: { color: string }) {
  const animate = useContext(MotionContext);
  const flag = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!animate || !flag.current) return;
    flag.current.rotation.y = Math.sin(clock.elapsedTime * 3) * 0.3;
  });

  return (
    <group position={[0.3, 0.12, 0.3]}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.9, 5]} />
        <meshStandardMaterial color="#5b5048" />
      </mesh>
      <group position={[0, 0.82, 0]}>
        <mesh ref={flag} position={[0.11, 0, 0]}>
          <boxGeometry args={[0.22, 0.13, 0.01]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    </group>
  );
}

function Hall({ color }: { color: string }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.8]} />
        <meshStandardMaterial color="#d6ccb4" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.36, 0]}>
        <boxGeometry args={[0.54, 0.48, 0.54]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <Roof color={color} radius={0.45} height={0.36} y={0.6} />
      <Flag color={color} />
    </>
  );
}

function Farm({ running }: { running: boolean }) {
  const animate = useContext(MotionContext);
  const crops = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    if (!animate || !running) return;
    crops.current.forEach((row, i) => {
      if (row) row.scale.y = 1 + Math.sin(clock.elapsedTime * 2 + i) * 0.2;
    });
  });

  return (
    <>
      <mesh receiveShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[0.88, 0.04, 0.88]} />
        <meshStandardMaterial color="#8a6338" />
      </mesh>
      {[-0.3, -0.1, 0.1, 0.3].map((z, i) => (
        <mesh
          key={z}
          ref={(mesh) => {
            crops.current[i] = mesh;
          }}
          castShadow
          position={[-0.06, 0.09, z]}
        >
          <boxGeometry args={[0.66, 0.1, 0.09]} />
          <meshStandardMaterial
            color={running ? (i % 2 ? "#e0bf4f" : "#8cb850") : "#a39270"}
          />
        </mesh>
      ))}
      <group position={[0.34, 0, -0.32]}>
        <mesh castShadow position={[0, 0.1, 0]}>
          <boxGeometry args={[0.18, 0.2, 0.2]} />
          <meshStandardMaterial color="#b4473a" />
        </mesh>
        <Roof color="#6e3a2f" radius={0.16} height={0.12} y={0.2} />
      </group>
    </>
  );
}

function LumberCamp({ running }: { running: boolean }) {
  return (
    <>
      <group position={[-0.12, 0, -0.1]}>
        <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
          <boxGeometry args={[0.42, 0.28, 0.36]} />
          <meshStandardMaterial color="#8b5a33" />
        </mesh>
        <Roof color="#5c3b22" radius={0.33} height={0.2} y={0.28} />
      </group>
      {[
        [0.18, 0.05, 0.14],
        [0.18, 0.05, 0.26],
        [0.18, 0.14, 0.2],
      ].map(([x = 0, y = 0, z = 0], i) => (
        <mesh key={i} castShadow position={[x, y, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, 0.38, 7]} />
          <meshStandardMaterial color="#b07a45" />
        </mesh>
      ))}
      {running ? (
        <Smoke position={[-0.05, 0.5, -0.1]} color="#cfc9c0" size={0.6} />
      ) : null}
    </>
  );
}

function FishingCamp({
  x,
  y,
  running,
}: {
  x: number;
  y: number;
  running: boolean;
}) {
  const animate = useContext(MotionContext);
  const boat = useRef<Group>(null);
  const [dx = 1, dz = 0] =
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(([ox = 0, oy = 0]) => tileAt(x + ox, y + oy)?.kind === "water") ??
    [];

  useFrame(({ clock }) => {
    if (!animate || !running || !boat.current) return;
    boat.current.position.y = -0.1 + Math.sin(clock.elapsedTime * 2) * 0.02;
    boat.current.rotation.z = Math.sin(clock.elapsedTime * 1.5) * 0.08;
  });

  return (
    <>
      <mesh castShadow receiveShadow position={[-dx * 0.12, 0.14, -dz * 0.12]}>
        <boxGeometry args={[0.38, 0.28, 0.38]} />
        <meshStandardMaterial color="#d2b07a" />
      </mesh>
      <group position={[-dx * 0.12, 0, -dz * 0.12]}>
        <Roof color="#5f87a3" radius={0.32} height={0.2} y={0.28} />
      </group>
      <mesh receiveShadow position={[dx * 0.45, -0.04, dz * 0.45]}>
        <boxGeometry args={dx ? [0.6, 0.04, 0.16] : [0.16, 0.04, 0.6]} />
        <meshStandardMaterial color="#9a7348" />
      </mesh>
      <group
        ref={boat}
        position={[dx * 0.82 + dz * 0.2, -0.1, dz * 0.82 + dx * 0.2]}
        rotation-y={dx ? 0 : Math.PI / 2}
      >
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.07, 0.13]} />
          <meshStandardMaterial color="#c0533c" />
        </mesh>
      </group>
    </>
  );
}

function HuntingCamp({ running }: { running: boolean }) {
  const animate = useContext(MotionContext);
  const flame = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!animate || !flame.current) return;
    flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 12) * 0.25;
  });

  return (
    <>
      <mesh castShadow position={[-0.1, 0.21, -0.06]} rotation-y={0.4}>
        <coneGeometry args={[0.28, 0.42, 4]} />
        <meshStandardMaterial color="#7d8f4c" flatShading />
      </mesh>
      <mesh position={[0.2, 0.02, 0.2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.04, 7]} />
        <meshStandardMaterial color="#6b625a" />
      </mesh>
      {running ? (
        <mesh ref={flame} position={[0.2, 0.1, 0.2]}>
          <coneGeometry args={[0.06, 0.15, 5]} />
          <meshStandardMaterial
            color="#ff9a3c"
            emissive="#ff6a1a"
            emissiveIntensity={1.4}
          />
        </mesh>
      ) : null}
    </>
  );
}

function Mine({
  kind,
  running,
}: {
  kind: "clay-mine" | "copper-mine";
  running: boolean;
}) {
  return (
    <>
      <mesh castShadow receiveShadow position={[-0.08, 0.18, 0]}>
        <boxGeometry args={[0.5, 0.36, 0.46]} />
        <meshStandardMaterial color="#7a746c" />
      </mesh>
      <mesh castShadow position={[-0.08, 0.39, 0]}>
        <boxGeometry args={[0.56, 0.06, 0.52]} />
        <meshStandardMaterial color="#4f4a45" />
      </mesh>
      <mesh castShadow position={[0.2, 0.31, -0.18]}>
        <cylinderGeometry args={[0.06, 0.08, 0.62, 7]} />
        <meshStandardMaterial color="#5a524b" />
      </mesh>
      <mesh castShadow position={[0.24, 0.08, 0.22]}>
        <dodecahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color={ORE_COLORS[kind]} flatShading />
      </mesh>
      {running ? <Smoke position={[0.2, 0.64, -0.18]} color="#8a857e" /> : null}
    </>
  );
}

function PausedMarker() {
  return (
    <Billboard position={[0, 1, 0]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.13, 0.13, 0.02, 8]} />
        <meshBasicMaterial color="#d6453b" />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <boxGeometry args={[0.15, 0.04, 0.005]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </Billboard>
  );
}

function easeOutBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

// Pops a newly placed building up out of the ground.
function Appear({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const start = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!enabled || !group.current) return;
    start.current ??= clock.elapsedTime;
    const t = Math.min((clock.elapsedTime - start.current) / 0.5, 1);
    group.current.scale.setScalar(Math.max(easeOutBack(t), 0.001));
  });

  return (
    <group ref={group} scale={enabled ? 0.001 : 1}>
      {children}
    </group>
  );
}

function BuildingModel({
  building,
  color,
}: {
  building: PlacedBuilding;
  color: string;
}) {
  const { kind, running, x, y } = building;
  switch (kind) {
    case "hall":
      return <Hall color={color} />;
    case "house":
      return <Houses color={color} seed={x * 31 + y} />;
    case "farm":
      return <Farm running={running} />;
    case "lumber-camp":
      return <LumberCamp running={running} />;
    case "fishing-camp":
      return <FishingCamp x={x} y={y} running={running} />;
    case "hunting-camp":
      return <HuntingCamp running={running} />;
    case "clay-mine":
    case "copper-mine":
      return <Mine kind={kind} running={running} />;
  }
}

function Fence({ city }: { city: City }) {
  const { plot, color } = city;
  const [x0, z0] = toWorld(plot.x, plot.y);
  const left = x0 - 0.5;
  const top = z0 - 0.5;
  const right = left + plot.width;
  const bottom = top + plot.height;
  const rails: [number, number, number, number][] = [
    [(left + right) / 2, top, plot.width, 0.05],
    [(left + right) / 2, bottom, plot.width, 0.05],
    [left, (top + bottom) / 2, 0.05, plot.height],
    [right, (top + bottom) / 2, 0.05, plot.height],
  ];

  return (
    <group>
      {rails.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.03, z]}>
          <boxGeometry args={[w, 0.06, d]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.25}
          />
        </mesh>
      ))}
      {[
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom],
      ].map(([x = 0, z = 0], i) => (
        <mesh key={i} castShadow position={[x, 0.1, z]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

// Citizens strolling the edge of their city.
function Walkers({ city, count = 3 }: { city: City; count?: number }) {
  const animate = useContext(MotionContext);
  const walkers = useRef<(Group | null)[]>([]);
  const { plot } = city;
  const [x0, z0] = toWorld(plot.x, plot.y);
  const inset = 0.1;
  const minX = x0 - 0.5 + inset;
  const minZ = z0 - 0.5 + inset;
  const width = plot.width - inset * 2;
  const depth = plot.height - inset * 2;
  const perimeter = 2 * (width + depth);

  function pointAt(distance: number): [number, number] {
    const d = ((distance % perimeter) + perimeter) % perimeter;
    if (d < width) return [minX + d, minZ];
    if (d < width + depth) return [minX + width, minZ + d - width];
    if (d < 2 * width + depth)
      return [minX + width - (d - width - depth), minZ + depth];
    return [minX, minZ + depth - (d - 2 * width - depth)];
  }

  useFrame(({ clock }) => {
    const time = animate ? clock.elapsedTime : 0;
    walkers.current.forEach((walker, i) => {
      if (!walker) return;
      const direction = i % 2 ? -1 : 1;
      const speed = 0.22 + hash(i, plot.x, plot.y) * 0.12;
      const distance = (i / count) * perimeter + direction * speed * time;
      const [x, z] = pointAt(distance);
      const [ax, az] = pointAt(distance + direction * 0.05);
      walker.position.set(x, Math.abs(Math.sin(time * 9 + i)) * 0.02, z);
      walker.rotation.y = Math.atan2(ax - x, az - z);
    });
  });

  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(group) => {
            walkers.current[i] = group;
          }}
        >
          <mesh castShadow position={[0, 0.07, 0]}>
            <capsuleGeometry args={[0.035, 0.06, 2, 6]} />
            <meshStandardMaterial color={city.color} />
          </mesh>
          <mesh castShadow position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <meshStandardMaterial color="#f0c9a0" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// A smoggy dome over cities whose pollution is climbing.
function Haze({ city, pollution }: { city: City; pollution: number }) {
  if (pollution < 3) return null;
  const { plot } = city;
  const [x0, z0] = toWorld(plot.x, plot.y);

  return (
    <mesh
      position={[x0 + (plot.width - 1) / 2, 1.1, z0 + (plot.height - 1) / 2]}
      scale={[plot.width * 0.72, 0.8, plot.height * 0.72]}
    >
      <sphereGeometry args={[1, 18, 12]} />
      <meshStandardMaterial
        color="#7d776c"
        transparent
        opacity={Math.min((pollution - 2) / 30, 0.55)}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Settlements({
  buildings,
  pollution,
  freshIds,
}: {
  buildings: PlacedBuilding[];
  pollution: Record<string, number>;
  freshIds?: ReadonlySet<string>;
}) {
  const animate = useContext(MotionContext);

  return (
    <group>
      {CITIES.map((city) => (
        <group key={city.id}>
          <Fence city={city} />
          <Walkers city={city} />
          <Haze city={city} pollution={pollution[city.id] ?? 0} />
        </group>
      ))}
      {buildings.map((building) => {
        const color =
          CITIES.find((city) => city.id === building.cityId)?.color ??
          "#999999";
        const [x, z] = toWorld(building.x, building.y);
        return (
          <group key={building.id} position={[x, 0, z]}>
            <Appear enabled={animate && (freshIds?.has(building.id) ?? false)}>
              <BuildingModel building={building} color={color} />
            </Appear>
            {isProduction(building.kind) && !building.running ? (
              <PausedMarker />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
