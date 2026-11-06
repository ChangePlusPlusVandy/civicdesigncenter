import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Tile } from "@cs/idle";
import { MotionContext, toWorld } from "./scene";

export interface PlacementCell {
  x: number;
  y: number;
  ok: boolean;
}

function surface(tile: Tile) {
  return tile.kind === "water" ? -0.13 : 0.015;
}

function Pin({ tile }: { tile: Tile }) {
  const animate = useContext(MotionContext);
  const pin = useRef<Group>(null);
  const [x, z] = toWorld(tile.x, tile.y);

  useFrame(({ clock }) => {
    if (!animate || !pin.current) return;
    pin.current.position.y = 1.35 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });

  const edges: [number, number, number, number][] = [
    [0, -0.47, 0.98, 0.06],
    [0, 0.47, 0.98, 0.06],
    [-0.47, 0, 0.06, 0.98],
    [0.47, 0, 0.06, 0.98],
  ];

  return (
    <group position={[x, 0, z]}>
      {edges.map(([ex, ez, w, d], i) => (
        <mesh key={i} position={[ex, surface(tile) + 0.03, ez]}>
          <boxGeometry args={[w, 0.05, d]} />
          <meshBasicMaterial color="#f5c542" />
        </mesh>
      ))}
      <group ref={pin} position={[0, 1.35, 0]}>
        <mesh rotation-x={Math.PI}>
          <coneGeometry args={[0.14, 0.3, 4]} />
          <meshStandardMaterial
            color="#f5c542"
            emissive="#f5a742"
            emissiveIntensity={0.4}
            flatShading
          />
        </mesh>
      </group>
    </group>
  );
}

function Highlight({
  x,
  y,
  height,
  color,
  opacity,
}: {
  x: number;
  y: number;
  height: number;
  color: string;
  opacity: number;
}) {
  const [wx, wz] = toWorld(x, y);
  return (
    <mesh position={[wx, height, wz]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

export function TileMarkers({
  hovered,
  selected,
  placementCells,
}: {
  hovered?: Tile | null;
  selected?: Tile | null;
  placementCells?: PlacementCell[];
}) {
  return (
    <group>
      {placementCells?.map(({ x, y, ok }) => (
        <Highlight
          key={`${x}-${y}`}
          x={x}
          y={y}
          height={0.02}
          color={ok ? "#3ddc84" : "#ef5b4f"}
          opacity={ok ? 0.55 : 0.4}
        />
      ))}
      {hovered ? (
        <Highlight
          x={hovered.x}
          y={hovered.y}
          height={surface(hovered) + 0.01}
          color="#ffffff"
          opacity={0.4}
        />
      ) : null}
      {selected ? <Pin tile={selected} /> : null}
    </group>
  );
}
