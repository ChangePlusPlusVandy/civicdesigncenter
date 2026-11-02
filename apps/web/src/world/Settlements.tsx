import { useContext, useRef, useState, type ReactNode } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { BUILDINGS, cityInfo, type PublicCity } from "@cs/idle";
import { BuildingModel } from "./Buildings";
import { Ball, Box } from "./parts";
import { MotionContext, hash, toWorld } from "./scene";

function Fence({ city }: { city: PublicCity }) {
  const { plot } = cityInfo(city.id);
  const [x0, z0] = toWorld(plot.x, plot.y);
  const left = x0 - 0.5;
  const top = z0 - 0.5;
  const right = left + plot.width;
  const bottom = top + plot.height;
  return (
    <group>
      {(
        [
          [(left + right) / 2, top, plot.width, 0.05],
          [(left + right) / 2, bottom, plot.width, 0.05],
          [left, (top + bottom) / 2, 0.05, plot.height],
          [right, (top + bottom) / 2, 0.05, plot.height],
        ] as const
      ).map(([x, z, w, d], i) => (
        <Box
          key={i}
          size={[w, 0.06, d]}
          position={[x, 0, z]}
          color={city.color}
          shadow={false}
        />
      ))}
      {(
        [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
        ] as const
      ).map(([x, z], i) => (
        <Box
          key={i}
          size={[0.1, 0.22, 0.1]}
          position={[x, 0, z]}
          color={city.color}
        />
      ))}
    </group>
  );
}

// Citizens strolling along their city's fence. More people, more walkers.
function Walkers({ city }: { city: PublicCity }) {
  const animate = useContext(MotionContext);
  const walkers = useRef<(Group | null)[]>([]);
  const { plot } = cityInfo(city.id);
  const count = Math.min(Math.max(Math.round(city.population / 2), 1), 10);
  const [x0, z0] = toWorld(plot.x, plot.y);
  const inset = 0.12;
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
      const speed = 0.2 + hash(i, plot.x, plot.y) * 0.14;
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
          <Box
            size={[0.06, 0.1, 0.05]}
            position={[0, 0.02, 0]}
            color={city.color}
          />
          <Ball
            radius={0.032}
            detail={0}
            position={[0, 0.16, 0]}
            color="#f0c9a0"
          />
        </group>
      ))}
    </group>
  );
}

// Dark puffs drifting over a city once its pollution is really high.
function Smog({ city }: { city: PublicCity }) {
  const animate = useContext(MotionContext);
  const puffs = useRef<(Group | null)[]>([]);
  const { plot } = cityInfo(city.id);
  const [x0, z0] = toWorld(plot.x, plot.y);
  const strength = Math.min((city.pollution - 8) / 20, 1);
  const count = Math.round(4 + strength * 6);

  useFrame(({ clock }) => {
    const time = animate ? clock.elapsedTime : 0;
    puffs.current.forEach((puff, i) => {
      if (!puff) return;
      const angle = time * 0.15 + (i / count) * Math.PI * 2;
      puff.position.set(
        x0 + (plot.width - 1) / 2 + Math.cos(angle) * plot.width * 0.32,
        1.3 + Math.sin(time * 0.5 + i) * 0.1 + (i % 3) * 0.12,
        z0 + (plot.height - 1) / 2 + Math.sin(angle) * plot.height * 0.32,
      );
    });
  });

  if (city.pollution < 8) return null;
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(puff) => {
            puffs.current[i] = puff;
          }}
        >
          <Ball
            radius={0.28 + (i % 3) * 0.08}
            detail={0}
            color="#6e6a63"
            opacity={0.25 + strength * 0.3}
            shadow={false}
          />
        </group>
      ))}
    </group>
  );
}

function easeOutBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

// Pops a newly built building up out of the ground.
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

function PausedSign() {
  return (
    <Billboard position={[0, 1.05, 0]}>
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

export function Settlements({ cities }: { cities: PublicCity[] }) {
  const animate = useContext(MotionContext);
  // Buildings already on the map when we first drew it don't pop in.
  const [known] = useState(
    () => new Set(cities.flatMap((c) => c.buildings.map((b) => b.id))),
  );

  return (
    <group>
      {cities.map((city) => (
        <group key={city.id}>
          <Fence city={city} />
          <Walkers city={city} />
          <Smog city={city} />
          {city.buildings.map((building) => {
            const [x, z] = toWorld(building.x, building.y);
            const hasWorkers = BUILDINGS[building.kind].workers > 0;
            return (
              <group key={building.id} position={[x, 0, z]}>
                <Appear enabled={animate && !known.has(building.id)}>
                  <BuildingModel
                    building={building}
                    color={city.color}
                    pollution={city.pollution}
                  />
                </Appear>
                {hasWorkers && !building.running ? <PausedSign /> : null}
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}
