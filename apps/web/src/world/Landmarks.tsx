// Map landmarks that nobody builds: Nashville's downtown skyline and the
// pedestrian bridge across the Cumberland.

import { useContext } from "react";
import type { Landmark } from "@cs/idle";
import { Box, Cone, Cylinder } from "./parts";
import { MapContext, hash, toWorld } from "./scene";

const GLASS = ["#8fa9bf", "#a7b9c8", "#7f98ae", "#b9c6cf"];

// Origin of a landmark's footprint, in world units, at its top-left tile's
// outer corner.
function corner(landmark: Landmark): [number, number] {
  const [x, z] = toWorld(landmark.x, landmark.y);
  return [x - 0.5, z - 0.5];
}

function Skyline({ landmark }: { landmark: Landmark }) {
  const [x0, z0] = corner(landmark);
  const cx = x0 + landmark.width / 2;
  const cz = z0 + landmark.height / 2;
  // A ring of towers around the tallest one in the middle.
  const towers = Array.from(
    { length: landmark.width * landmark.height },
    (_, i) => {
      const gx = i % landmark.width;
      const gy = Math.floor(i / landmark.width);
      const seed = hash(landmark.x + gx, landmark.y + gy, 40);
      return {
        x: x0 + gx + 0.5 + (seed - 0.5) * 0.15,
        z: z0 + gy + 0.5 + (hash(gx, gy, 41) - 0.5) * 0.15,
        height: 0.6 + seed * 1.1,
        width: 0.42 + hash(gx, gy, 42) * 0.2,
        color: GLASS[Math.floor(hash(gx, gy, 43) * GLASS.length)] ?? "#a7b9c8",
        center:
          gx === Math.floor(landmark.width / 2) &&
          gy === Math.floor(landmark.height / 2),
      };
    },
  );

  return (
    <group>
      <Box
        size={[landmark.width - 0.08, 0.04, landmark.height - 0.08]}
        position={[cx, 0, cz]}
        color="#cfc9bb"
        shadow={false}
      />
      {towers
        .filter((tower) => !tower.center)
        .map((tower, i) => (
          <group key={i} position={[tower.x, 0, tower.z]}>
            <Box
              size={[tower.width, tower.height, tower.width]}
              color={tower.color}
            />
            <Box
              size={[tower.width + 0.04, 0.05, tower.width + 0.04]}
              position={[0, tower.height, 0]}
              color="#6d7680"
            />
          </group>
        ))}
      {/* A nod to the AT&T "Batman" building: a tall tower with two spires. */}
      <group position={[cx, 0, cz]}>
        <Box size={[0.5, 2.1, 0.42]} color="#5f7a91" />
        <Box size={[0.36, 0.3, 0.42]} position={[0, 2.1, 0]} color="#5f7a91" />
        {[-0.19, 0.19].map((offset) => (
          <group key={offset} position={[offset, 2.1, 0]}>
            <Box size={[0.08, 0.32, 0.08]} color="#4d6578" />
            <Cone
              radius={0.06}
              height={0.5}
              sides={4}
              position={[0, 0.32, 0]}
              color="#4d6578"
            />
          </group>
        ))}
        <Cylinder
          radius={0.012}
          height={0.3}
          position={[0, 2.4, 0]}
          color="#3b4a57"
          sides={4}
          shadow={false}
        />
      </group>
    </group>
  );
}

// A truss bridge across the water, a bit like the John Seigenthaler bridge.
function Bridge({ landmark }: { landmark: Landmark }) {
  const [x0, z0] = corner(landmark);
  const along = landmark.width >= landmark.height;
  const length = (along ? landmark.width : landmark.height) + 0.4;
  const cx = x0 + landmark.width / 2;
  const cz = z0 + landmark.height / 2;
  return (
    <group position={[cx, 0, cz]} rotation={[0, along ? 0 : Math.PI / 2, 0]}>
      <Box
        size={[length, 0.06, 0.32]}
        position={[0, -0.02, 0]}
        color="#9a8a76"
      />
      {[-0.17, 0.17].map((side) => (
        <group key={side}>
          <Box
            size={[length, 0.03, 0.03]}
            position={[0, 0.16, side]}
            color="#5b6b77"
          />
          {Array.from({ length: 6 }, (_, i) => {
            const t = (i + 0.5) / 6;
            const x = -length / 2 + t * length;
            const height = 0.12 + Math.sin(t * Math.PI) * 0.22;
            return (
              <Box
                key={i}
                size={[0.03, height, 0.03]}
                position={[x, 0.04, side]}
                color="#5b6b77"
              />
            );
          })}
        </group>
      ))}
      {[-length / 2 + 0.1, length / 2 - 0.1].map((x) => (
        <Box
          key={x}
          size={[0.12, 0.3, 0.38]}
          position={[x, -0.28, 0]}
          color="#8f8576"
        />
      ))}
    </group>
  );
}

export function Landmarks() {
  const map = useContext(MapContext);
  return (
    <group>
      {map.landmarks.map((landmark, i) =>
        landmark.kind === "skyline" ? (
          <Skyline key={i} landmark={landmark} />
        ) : (
          <Bridge key={i} landmark={landmark} />
        ),
      )}
    </group>
  );
}
