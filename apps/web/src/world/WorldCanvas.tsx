import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MapControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Vector3 } from "three";
import {
  cityInfo,
  type CityId,
  type CommonsView,
  type PublicCity,
  type Tile,
} from "@cs/idle";
import { Badge, LabelLayer, LabelTracker, Popup, type Label } from "./Labels";
import { TileMarkers, type PlacementCell } from "./Markers";
import { MotionContext, toWorld, usePrefersReducedMotion } from "./scene";
import { Settlements } from "./Settlements";
import { Clouds, Terrain, type TileHandlers } from "./Terrain";

// Locked, angled orthographic camera: 45° around the map, 55° down. Steep
// enough that every tile stays easy to read and tap, shallow enough to show
// height, smoke and trees.
const PITCH = (55 * Math.PI) / 180;
const BASE_YAW = Math.PI / 4;
const RADIUS = 40;
const PAN_LIMIT = 8;

function orbit(yaw: number, x = 0, z = 0): [number, number, number] {
  const flat = RADIUS * Math.cos(PITCH);
  return [
    x + flat * Math.sin(yaw),
    RADIUS * Math.sin(PITCH),
    z + flat * Math.cos(yaw),
  ];
}

// A slow cinematic orbit for page backgrounds.
function BackdropCamera() {
  const animate = useContext(MotionContext);
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  const yaw = useRef(BASE_YAW);

  useLayoutEffect(() => {
    const { camera } = get();
    camera.zoom = Math.max(size.width / 27, size.height / 17);
    camera.updateProjectionMatrix();
  }, [get, size]);

  useFrame(({ camera }, delta) => {
    if (animate) yaw.current += delta * 0.04;
    camera.position.set(...orbit(yaw.current));
    camera.lookAt(0, 0, 0);
  });

  return null;
}

interface ControlsLike {
  target: Vector3;
  update(): void;
}

// Pan and zoom only; rotation snaps in quarter turns so nobody gets lost.
// With `focus`, starts zoomed in on that city.
function InteractiveCamera({
  quarterTurns,
  focus,
}: {
  quarterTurns: number;
  focus?: CityId;
}) {
  const animate = useContext(MotionContext);
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useThree((state) => state.controls) as ControlsLike | null;
  const yaw = useRef(BASE_YAW);
  const focused = useRef(false);
  // Leave room for the panels above and below the map.
  const fit = Math.min(size.width / 26, size.height / 22);

  useLayoutEffect(() => {
    const { camera } = get();
    camera.zoom = focus ? fit * 1.9 : fit;
    camera.updateProjectionMatrix();
  }, [get, fit, focus]);

  useEffect(() => invalidate(), [quarterTurns, invalidate]);

  useFrame(({ camera }, delta) => {
    if (!controls) return;
    const { target } = controls;

    if (focus && !focused.current) {
      focused.current = true;
      const { plot } = cityInfo(focus);
      const [x, z] = toWorld(
        plot.x + (plot.width - 1) / 2,
        plot.y + (plot.height - 1) / 2,
      );
      target.set(x, 0, z);
      camera.position.set(...orbit(yaw.current, x, z));
      camera.lookAt(target);
      controls.update();
    }

    const x = Math.min(Math.max(target.x, -PAN_LIMIT), PAN_LIMIT);
    const z = Math.min(Math.max(target.z, -PAN_LIMIT), PAN_LIMIT);
    if (x !== target.x || z !== target.z) {
      camera.position.x += x - target.x;
      camera.position.z += z - target.z;
      target.set(x, target.y, z);
    }

    const goal = BASE_YAW + (quarterTurns * Math.PI) / 2;
    const remaining = goal - yaw.current;
    if (Math.abs(remaining) > 0.0005) {
      yaw.current = animate
        ? yaw.current + remaining * Math.min(1, delta * 8)
        : goal;
      camera.position.set(...orbit(yaw.current, target.x, target.z));
      camera.lookAt(target);
      controls.update();
      invalidate();
    }
  });

  return (
    <MapControls
      makeDefault
      enableRotate={false}
      enableDamping
      minZoom={fit * 0.8}
      maxZoom={fit * 3}
    />
  );
}

// Badges for every building in the viewer's city, plus a popup for each one
// that produced something on the last tick (re-keyed by tick to replay).
function cityLabels(
  cities: PublicCity[],
  myCityId: CityId | undefined,
  tick: number,
  animate: boolean,
): Label[] {
  const city = cities.find((c) => c.id === myCityId);
  if (!city) return [];
  return city.buildings.flatMap((building) => {
    const [x, z] = toWorld(building.x, building.y);
    const labels: Label[] = [
      {
        id: `${building.id}-badge`,
        position: [x, 1.15, z],
        node: <Badge building={building} />,
      },
    ];
    const produced = Object.values(building.lastOutput).some(
      (amount) => (amount ?? 0) > 0,
    );
    if (animate && produced) {
      labels.push({
        id: `${building.id}-popup`,
        position: [x, 0.7, z],
        node: <Popup key={tick} building={building} />,
      });
    }
    return labels;
  });
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#fff8e7", "#6f8a52", 1.3]} />
      <directionalLight
        position={[9, 16, 6]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
    </>
  );
}

export interface WorldCanvasProps extends TileHandlers {
  mode: "backdrop" | "interactive";
  cities: PublicCity[];
  commons: CommonsView[];
  tick: number;
  // The viewer's own city: badges and popups, and the camera starts there.
  myCityId?: CityId;
  hovered?: Tile | null;
  selected?: Tile | null;
  placementCells?: PlacementCell[];
  quarterTurns?: number;
  onReady?: () => void;
}

export function WorldCanvas({
  mode,
  cities,
  commons,
  tick,
  myCityId,
  hovered,
  selected,
  placementCells,
  quarterTurns = 0,
  onReady,
  onTileHover,
  onTileClick,
}: WorldCanvasProps) {
  const animate = !usePrefersReducedMotion();
  const interactive = mode === "interactive";
  const labelElements = useRef(new Map<string, HTMLElement>());
  const labels = useMemo(
    () => cityLabels(cities, myCityId, tick, animate),
    [cities, myCityId, tick, animate],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        orthographic
        shadows
        flat
        dpr={[1, 1.5]}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: orbit(BASE_YAW), zoom: 40, near: 0.1, far: 200 }}
        style={
          interactive ? { touchAction: "none" } : { pointerEvents: "none" }
        }
        onCreated={() => onReady?.()}
      >
        <MotionContext.Provider value={animate}>
          <Lights />
          {interactive ? (
            <InteractiveCamera quarterTurns={quarterTurns} focus={myCityId} />
          ) : (
            <>
              <BackdropCamera />
              <Clouds />
            </>
          )}
          <Terrain
            commons={commons}
            onTileHover={interactive ? onTileHover : undefined}
            onTileClick={interactive ? onTileClick : undefined}
          />
          <Settlements cities={cities} />
          <LabelTracker labels={labels} elements={labelElements} />
          {interactive ? (
            <TileMarkers
              hovered={hovered}
              selected={selected}
              placementCells={placementCells}
            />
          ) : null}
        </MotionContext.Provider>
      </Canvas>
      <LabelLayer labels={labels} elements={labelElements} />
    </div>
  );
}
