// Low-poly building models. Every kind has its own silhouette so students
// can tell them apart at a glance, and each grows visibly with its level.

import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { tileAt, type Building } from "@cs/idle";
import { MotionContext } from "./scene";
import { Ball, Box, Cone, Cylinder, Rock, Roof } from "./parts";

type Vec3 = [number, number, number];

const WALL = "#f2e8d2";
const TIMBER = "#8b5a33";
const DARK_TIMBER = "#5c3b22";
const STONE = "#c9bfa8";

// Smoke from a chimney. Thicker and darker when the city is polluted.
export function Smoke({
  position,
  pollution = 0,
  light = false,
}: {
  position: Vec3;
  pollution?: number;
  light?: boolean;
}) {
  const animate = useContext(MotionContext);
  const puffs = useRef<(Mesh | null)[]>([]);
  const count = pollution > 12 ? 6 : 4;
  const size = 1 + Math.min(pollution / 20, 1);
  const color = light ? "#e4dfd6" : pollution > 12 ? "#6e6962" : "#9b958d";

  useFrame(({ clock }) => {
    puffs.current.forEach((puff, i) => {
      if (!puff) return;
      const t = animate
        ? (clock.elapsedTime * 0.35 + i / count) % 1
        : i / count;
      puff.position.set(t * 0.3, t * 1.1, t * 0.1);
      puff.scale.setScalar(
        Math.max((0.06 + t * 0.14) * (1 - t ** 4) * size, 0.001),
      );
    });
  });

  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <Ball
          key={i}
          ref={(mesh) => {
            puffs.current[i] = mesh;
          }}
          radius={1}
          detail={0}
          color={color}
          opacity={0.75}
          shadow={false}
        />
      ))}
    </group>
  );
}

function Spin({
  speed,
  axis = "y",
  enabled,
  position,
  children,
}: {
  speed: number;
  axis?: "x" | "y" | "z";
  enabled: boolean;
  position?: Vec3;
  children: React.ReactNode;
}) {
  const animate = useContext(MotionContext);
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (animate && enabled && group.current)
      group.current.rotation[axis] += delta * speed;
  });
  return (
    <group ref={group} position={position}>
      {children}
    </group>
  );
}

function Hall({ color }: { color: string }) {
  const animate = useContext(MotionContext);
  const flag = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (animate && flag.current)
      flag.current.rotation.y = Math.sin(clock.elapsedTime * 3) * 0.3;
  });
  return (
    <>
      {/* Cobbled square around the hall. */}
      <Box size={[0.98, 0.03, 0.98]} color="#cfc6b0" shadow={false} />
      <Box size={[0.62, 0.1, 0.62]} position={[0, 0.03, 0]} color={STONE} />
      <Box size={[0.5, 0.42, 0.5]} position={[0, 0.13, 0]} color={WALL} />
      {[-0.17, 0, 0.17].map((x) => (
        <Cylinder
          key={x}
          radius={0.03}
          height={0.36}
          position={[x, 0.13, 0.27]}
          color="#ffffff"
          sides={6}
        />
      ))}
      <Roof width={0.6} height={0.32} position={[0, 0.55, 0]} color={color} />
      <Cylinder
        radius={0.012}
        height={0.6}
        position={[0.24, 0.87, 0.24]}
        color="#5b5048"
        sides={5}
        shadow={false}
      />
      <group position={[0.24, 1.38, 0.24]}>
        <mesh ref={flag} position={[0.1, 0, 0]}>
          <boxGeometry args={[0.2, 0.12, 0.01]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    </>
  );
}

// Homes grow from cottages into townhouses as they're upgraded.
function Houses({
  color,
  level,
  seed,
}: {
  color: string;
  level: number;
  seed: number;
}) {
  const spots: { pos: Vec3; w: number; d: number; h: number }[] =
    level >= 3
      ? [
          { pos: [-0.2, 0, -0.18], w: 0.32, d: 0.3, h: 0.62 },
          { pos: [0.2, 0, -0.16], w: 0.3, d: 0.3, h: 0.5 },
          { pos: [0, 0, 0.22], w: 0.42, d: 0.26, h: 0.4 },
        ]
      : level === 2
        ? [
            { pos: [-0.2, 0, -0.17], w: 0.3, d: 0.28, h: 0.38 },
            { pos: [0.21, 0, -0.12], w: 0.28, d: 0.28, h: 0.32 },
            { pos: [-0.02, 0, 0.22], w: 0.32, d: 0.26, h: 0.3 },
          ]
        : [
            { pos: [-0.18, 0, -0.14], w: 0.32, d: 0.3, h: 0.28 },
            { pos: [0.2, 0, 0.16], w: 0.3, d: 0.28, h: 0.24 },
          ];
  return (
    <>
      {spots.map(({ pos, w, d, h }, i) => (
        <group
          key={i}
          position={pos}
          rotation={[0, (seed + i) % 2 ? 0 : Math.PI / 2, 0]}
        >
          <Box size={[w, h, d]} color={WALL} />
          <Box
            size={[0.07, 0.12, 0.01]}
            position={[0, 0, d / 2]}
            color="#6b4a2e"
            shadow={false}
          />
          {h > 0.3 ? (
            <Box
              size={[0.08, 0.07, 0.01]}
              position={[0, h * 0.6, d / 2]}
              color="#9ccbe0"
              shadow={false}
            />
          ) : null}
          <Roof
            width={Math.max(w, d) + 0.04}
            height={0.18}
            position={[0, h, 0]}
            color={color}
          />
        </group>
      ))}
    </>
  );
}

function Park({ level }: { level: number }) {
  const trees: Vec3[] = [
    [-0.28, 0, -0.26],
    [0.27, 0, -0.24],
    [-0.26, 0, 0.27],
    ...(level >= 2 ? ([[0.28, 0, 0.26]] as Vec3[]) : []),
  ];
  return (
    <>
      <Box size={[0.94, 0.03, 0.94]} color="#7fbf5a" shadow={false} />
      {trees.map((pos, i) => (
        <group key={i} position={pos}>
          <Cylinder radius={0.03} height={0.16} color="#6e4b2c" sides={5} />
          <Ball
            radius={0.13}
            detail={0}
            position={[0, 0.25, 0]}
            color={i % 2 ? "#4c9a45" : "#5fb04f"}
          />
        </group>
      ))}
      <Cylinder
        radius={0.16}
        height={0.06}
        position={[0, 0.03, 0]}
        color={STONE}
        sides={10}
      />
      <Cylinder
        radius={0.13}
        height={0.02}
        position={[0, 0.09, 0]}
        color="#6fc3e0"
        sides={10}
        shadow={false}
      />
      {level >= 3 ? (
        <Cylinder
          radius={0.03}
          height={0.18}
          position={[0, 0.09, 0]}
          color="#bfe8f5"
          sides={6}
        />
      ) : null}
      <Box size={[0.2, 0.04, 0.06]} position={[0, 0.06, 0.3]} color={TIMBER} />
    </>
  );
}

function Farm({ level, running }: { level: number; running: boolean }) {
  const animate = useContext(MotionContext);
  const rows = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (!animate || !running) return;
    rows.current.forEach((row, i) => {
      if (row) row.scale.y = 1 + Math.sin(clock.elapsedTime * 2 + i) * 0.2;
    });
  });
  return (
    <>
      <Box size={[0.92, 0.04, 0.92]} color="#8a6338" shadow={false} />
      {[-0.32, -0.16, 0, 0.16].map((z, i) => (
        <Box
          key={z}
          ref={(mesh) => {
            rows.current[i] = mesh;
          }}
          size={[0.56, 0.1, 0.08]}
          position={[-0.12, 0.04, z]}
          color={running ? (i % 2 ? "#e0bf4f" : "#8cb850") : "#a39270"}
        />
      ))}
      <group position={[0.3, 0, 0.26]}>
        <Box size={[0.26, 0.22, 0.24]} color="#b4473a" />
        <Box
          size={[0.08, 0.12, 0.01]}
          position={[0, 0, 0.12]}
          color={WALL}
          shadow={false}
        />
        <Roof
          width={0.3}
          height={0.14}
          position={[0, 0.22, 0]}
          color="#6e3a2f"
        />
      </group>
      {level >= 2 ? (
        <group position={[0.34, 0, -0.18]}>
          <Cylinder radius={0.08} height={0.42} color="#d8d4ca" sides={10} />
          <Ball radius={0.08} position={[0, 0.42, 0]} color="#a9a59c" />
        </group>
      ) : null}
      {level >= 3 ? (
        <group position={[0.12, 0, 0.3]}>
          <Cylinder radius={0.07} height={0.36} color="#d8d4ca" sides={10} />
          <Ball radius={0.07} position={[0, 0.36, 0]} color="#a9a59c" />
        </group>
      ) : null}
    </>
  );
}

const WATER_DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function FishingDock({
  x,
  y,
  level,
  running,
}: {
  x: number;
  y: number;
  level: number;
  running: boolean;
}) {
  const animate = useContext(MotionContext);
  const boats = useRef<(Group | null)[]>([]);
  const [dx, dz] = WATER_DIRECTIONS.find(
    ([ox, oy]) => tileAt(x + ox, y + oy)?.kind === "water",
  ) ?? [1, 0];
  const along = dx !== 0;
  const length = 0.5 + level * 0.12;

  useFrame(({ clock }) => {
    if (!animate || !running) return;
    boats.current.forEach((boat, i) => {
      if (!boat) return;
      boat.position.y = -0.16 + Math.sin(clock.elapsedTime * 2 + i) * 0.02;
      boat.rotation.z = Math.sin(clock.elapsedTime * 1.5 + i) * 0.08;
    });
  });

  return (
    <>
      <group position={[-dx * 0.14, 0, -dz * 0.14]}>
        <Box size={[0.36 + level * 0.04, 0.26, 0.34]} color="#d2b07a" />
        <Roof
          width={0.42 + level * 0.04}
          height={0.18}
          position={[0, 0.26, 0]}
          color="#5f87a3"
        />
      </group>
      <Box
        size={along ? [length, 0.04, 0.16] : [0.16, 0.04, length]}
        position={[dx * (0.25 + length / 2), -0.06, dz * (0.25 + length / 2)]}
        color="#9a7348"
      />
      {Array.from({ length: Math.min(level, 2) }, (_, i) => (
        <group
          key={i}
          ref={(boat) => {
            boats.current[i] = boat;
          }}
          position={[
            dx * (0.75 + i * 0.1) + (along ? 0 : 0.24) * (i ? -1 : 1),
            -0.16,
            dz * (0.75 + i * 0.1) + (along ? 0.24 : 0) * (i ? -1 : 1),
          ]}
          rotation={[0, along ? 0 : Math.PI / 2, 0]}
        >
          <Box size={[0.3, 0.07, 0.13]} color="#c0533c" />
          <Cylinder
            radius={0.01}
            height={0.22}
            position={[0.02, 0.07, 0]}
            color="#5b5048"
            sides={4}
            shadow={false}
          />
        </group>
      ))}
    </>
  );
}

function LumberCamp({ level, running }: { level: number; running: boolean }) {
  const piles: Vec3[] = [
    [0.2, 0, 0.18],
    ...(level >= 2 ? ([[0.2, 0, -0.08]] as Vec3[]) : []),
    ...(level >= 3 ? ([[-0.25, 0, 0.3]] as Vec3[]) : []),
  ];
  return (
    <>
      <group position={[-0.14, 0, -0.14]}>
        <Box size={[0.42, 0.26, 0.36]} color={TIMBER} />
        <Roof
          width={0.46}
          height={0.18}
          position={[0, 0.26, 0]}
          color={DARK_TIMBER}
        />
        <Cylinder
          radius={0.03}
          height={0.16}
          position={[0.12, 0.36, 0]}
          color="#6b625a"
          sides={5}
        />
      </group>
      {piles.map((pos, p) => (
        <group key={p} position={pos}>
          {[
            [0, 0, -0.06],
            [0, 0, 0.06],
            [0, 0.09, 0],
          ].map(([lx = 0, ly = 0, lz = 0], i) => (
            <Cylinder
              key={i}
              radius={0.045}
              height={0.34}
              position={[lx, ly + 0.05, lz]}
              rotation={[0, 0, Math.PI / 2]}
              color={i === 2 ? "#c08a50" : "#b07a45"}
            />
          ))}
        </group>
      ))}
      {/* A saw blade that spins while the camp runs. */}
      <Spin speed={8} axis="z" enabled={running} position={[0.3, 0.16, -0.28]}>
        <Cylinder
          radius={0.11}
          height={0.015}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, -0.0075, 0]}
          color="#c7cbd1"
          sides={12}
        />
      </Spin>
      <Box
        size={[0.03, 0.16, 0.03]}
        position={[0.3, 0, -0.28]}
        color={DARK_TIMBER}
      />
      {running ? <Smoke position={[-0.02, 0.56, -0.14]} light /> : null}
    </>
  );
}

function HuntingLodge({ level, running }: { level: number; running: boolean }) {
  const animate = useContext(MotionContext);
  const flame = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (animate && flame.current)
      flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 12) * 0.25;
  });
  const tents: Vec3[] = [
    [-0.2, 0, -0.16],
    ...(level >= 2 ? ([[0.18, 0, -0.24]] as Vec3[]) : []),
    ...(level >= 3 ? ([[-0.26, 0, 0.22]] as Vec3[]) : []),
  ];
  return (
    <>
      {tents.map((pos, i) => (
        <Cone
          key={i}
          radius={0.22}
          height={0.38}
          sides={4}
          position={pos}
          rotation={[0, 0.4 + i, 0]}
          color={i % 2 ? "#8a9a55" : "#7d8f4c"}
        />
      ))}
      <Cylinder
        radius={0.09}
        height={0.03}
        position={[0.18, 0, 0.18]}
        color="#6b625a"
        sides={7}
      />
      {running ? (
        <Cone
          ref={flame}
          radius={0.06}
          height={0.15}
          sides={5}
          position={[0.18, 0.03, 0.18]}
          color="#ff9a3c"
          emissive="#ff6a1a"
          shadow={false}
        />
      ) : null}
      <Box
        size={[0.24, 0.02, 0.02]}
        position={[0.2, 0.22, -0.02]}
        color={TIMBER}
      />
      <Box
        size={[0.02, 0.22, 0.02]}
        position={[0.09, 0, -0.02]}
        color={TIMBER}
      />
      <Box
        size={[0.02, 0.22, 0.02]}
        position={[0.31, 0, -0.02]}
        color={TIMBER}
      />
    </>
  );
}

function ClayPit({
  level,
  running,
  pollution,
}: {
  level: number;
  running: boolean;
  pollution: number;
}) {
  return (
    <>
      <Box
        size={[0.5, 0.02, 0.42]}
        position={[-0.18, 0, 0.18]}
        color="#7a5232"
        shadow={false}
      />
      <Box
        size={[0.4, 0.03, 0.32]}
        position={[-0.18, 0, 0.18]}
        color="#a8673d"
        shadow={false}
      />
      {/* The kiln: a brick dome with a chimney. */}
      <group position={[0.2, 0, -0.16]}>
        <Cylinder radius={0.2} height={0.12} color="#b5603a" sides={10} />
        <Ball radius={0.2} position={[0, 0.12, 0]} color="#c46c42" />
        <Cylinder
          radius={0.04}
          height={0.3}
          position={[0.08, 0.2, 0.06]}
          color="#8f4a2d"
          sides={6}
        />
        {running ? (
          <Smoke position={[0.08, 0.52, 0.06]} pollution={pollution} />
        ) : null}
      </group>
      {Array.from({ length: level + 1 }, (_, i) => (
        <Box
          key={i}
          size={[0.16, 0.08, 0.1]}
          position={[-0.28 + (i % 2) * 0.18, Math.floor(i / 2) * 0.08, -0.26]}
          color="#d07a4a"
        />
      ))}
    </>
  );
}

function CopperMine({
  level,
  running,
  pollution,
}: {
  level: number;
  running: boolean;
  pollution: number;
}) {
  const height = 0.5 + level * 0.12;
  return (
    <>
      {/* Headframe: the tall tower over the mine shaft. */}
      <group position={[-0.14, 0, -0.12]}>
        {[
          [-0.12, -0.12],
          [0.12, -0.12],
          [-0.12, 0.12],
          [0.12, 0.12],
        ].map(([px = 0, pz = 0], i) => (
          <Box
            key={i}
            size={[0.035, height, 0.035]}
            position={[px * (1 - 0.3), 0, pz * (1 - 0.3)]}
            color="#5a4a3c"
          />
        ))}
        <Box
          size={[0.24, 0.04, 0.24]}
          position={[0, height, 0]}
          color="#4d3f33"
        />
        <Spin
          speed={3}
          axis="x"
          enabled={running}
          position={[0, height + 0.12, 0]}
        >
          <Cylinder
            radius={0.11}
            height={0.03}
            rotation={[0, 0, Math.PI / 2]}
            position={[-0.015, 0, 0]}
            color="#c27a3e"
            sides={10}
          />
        </Spin>
      </group>
      <group position={[0.22, 0, 0.1]}>
        <Box size={[0.32, 0.26, 0.34]} color="#7a746c" />
        <Box
          size={[0.36, 0.04, 0.38]}
          position={[0, 0.26, 0]}
          color="#4f4a45"
        />
        <Cylinder
          radius={0.045}
          height={0.3}
          position={[0.08, 0.3, -0.1]}
          color="#5a524b"
          sides={6}
        />
        {running ? (
          <Smoke position={[0.08, 0.62, -0.1]} pollution={pollution} />
        ) : null}
      </group>
      {/* Ore cart full of copper. */}
      <group position={[-0.2, 0, 0.28]}>
        <Box size={[0.2, 0.08, 0.13]} position={[0, 0.04, 0]} color="#6b6158" />
        <Rock radius={0.06} position={[-0.03, 0.1, 0]} color="#3f9c84" />
        <Rock radius={0.05} position={[0.05, 0.1, 0.02]} color="#c27a3e" />
      </group>
    </>
  );
}

export function BuildingModel({
  building,
  color,
  pollution,
}: {
  building: Building;
  color: string;
  pollution: number;
}) {
  const { kind, level, running, x, y } = building;
  const working = running && building.status === "ok";
  switch (kind) {
    case "hall":
      return <Hall color={color} />;
    case "house":
      return <Houses color={color} level={level} seed={x * 31 + y} />;
    case "park":
      return <Park level={level} />;
    case "farm":
      return <Farm level={level} running={working} />;
    case "fishing-dock":
      return <FishingDock x={x} y={y} level={level} running={working} />;
    case "lumber-camp":
      return <LumberCamp level={level} running={working} />;
    case "hunting-lodge":
      return <HuntingLodge level={level} running={working} />;
    case "clay-pit":
      return <ClayPit level={level} running={working} pollution={pollution} />;
    case "copper-mine":
      return (
        <CopperMine level={level} running={working} pollution={pollution} />
      );
  }
}
