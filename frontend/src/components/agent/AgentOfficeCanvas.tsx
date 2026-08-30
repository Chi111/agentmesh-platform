import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Group, MathUtils, Mesh, OrthographicCamera, QuadraticBezierCurve3, TOUCH, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NounEmployeeModel, type NounEmployeeAnimation } from './NounEmployeeModel';

export type AgentOfficeState = 'executing' | 'assigned' | 'ready' | 'trial' | 'paused' | 'attention';

export interface AgentOfficeActor {
  id: string;
  name: string;
  state: AgentOfficeState;
  accent: 'cyan' | 'lime' | 'amber';
  statusLabel: string;
}

interface AgentOfficeCanvasProps {
  actors: AgentOfficeActor[];
  selectedId: string;
  onSelect: (agentId: string) => void;
  onClearSelection?: () => void;
}

const STATE_COLORS: Record<AgentOfficeState, string> = {
  executing: '#B7F34A',
  assigned: '#08AAC4',
  ready: '#39D7E7',
  trial: '#D99A2B',
  paused: '#687078',
  attention: '#D94F4F',
};

const ACCENT_COLORS: Record<AgentOfficeActor['accent'], string> = {
  cyan: '#39D7E7',
  lime: '#B7F34A',
  amber: '#D99A2B',
};

const SCENE_PALETTE = {
  background: '#E7EFEB',
  shell: '#AFC3BE',
  floor: '#F1F3EE',
  workFloor: '#D9E9E7',
  wall: '#E8ECE8',
  outline: '#101318',
  cyan: '#08AAC4',
  task: '#08AAC4',
  lounge: '#B7F34A',
  training: '#D99A2B',
  repair: '#D94F4F',
} as const;

const WORKSTATION_PALETTES = [
  { mat: '#8BD6DE', desk: '#15252D', chair: '#B7F34A' },
  { mat: '#A8C3C5', desk: '#08AAC4', chair: '#C4F35A' },
  { mat: '#CBE98A', desk: '#15252D', chair: '#39D7E7' },
  { mat: '#B8C3C1', desk: '#D99A2B', chair: '#08AAC4' },
] as const;

const DESK_POSITIONS: Array<[number, number]> = [
  [-5.8, -3.45], [-3.25, -3.45], [-0.7, -3.45],
  [-5.8, -1.05], [-3.25, -1.05], [-0.7, -1.05],
  [-5.8, 1.35], [-3.25, 1.35],
];

const LOUNGE_POSITIONS: Array<[number, number]> = [
  [3.45, 1], [3.55, 3.05], [7.35, 2.7], [5.15, 0.45],
  [7.6, 0.75], [3.65, 4.55], [6.95, 4.45], [1.85, 3.65],
];
const TRIAL_POSITIONS: Array<[number, number]> = [
  [2.75, -3.55], [4.55, -1.65], [6.35, -3.55], [2.55, -1.85],
  [6.55, -1.8], [2.35, -4.65], [6.25, -4.45], [7.85, -3.15],
];
const REPAIR_POSITIONS: Array<[number, number]> = [
  [5.3, 1.25], [7.5, 1.05], [4.55, -0.2], [8.5, -0.25],
  [5.15, -1.8], [7.65, -1.75], [5.1, 2.7], [7.2, 2.75],
];

// The Nouns heads are wider than their bodies, so collision clearance follows the widest silhouette.
const AGENT_COLLISION_RADIUS = 0.9;
const AGENT_MIN_DISTANCE = AGENT_COLLISION_RADIUS * 2 + 0.12;
const COLLISION_SOLVER_PASSES = 3;
const WORLD_RADIUS_X = 8.75;
const WORLD_RADIUS_Z = 5;

interface ActorPlacement {
  position: [number, number, number];
  rotation: number;
}

interface CollisionPoint {
  x: number;
  z: number;
}

interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  ownerIndex?: number;
  allowsOwnerOccupancy?: boolean;
}

interface RegisteredActor {
  group: Group;
  index: number;
  state: AgentOfficeState;
}

function footprint(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  metadata: Pick<CollisionBox, 'ownerIndex' | 'allowsOwnerOccupancy'> = {},
): CollisionBox {
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
    ...metadata,
  };
}

const STATIC_COLLIDERS: CollisionBox[] = [
  // Workstations: desktops contain their legs, screens and lamps in plan view.
  // A chair remains solid for everyone except its assigned employee while working.
  ...DESK_POSITIONS.flatMap(([x, z], index) => [
    footprint(x, z, 2.08, 0.96),
    footprint(x + 0.03, z + 0.86, 0.72, 0.34, { ownerIndex: index, allowsOwnerOccupancy: true }),
  ]),
  // Room walls; wall-mounted displays inherit the back-wall footprint.
  footprint(-9.05, -0.2, 0.2, 10.4),
  footprint(0, -5.55, 18.2, 0.2),
  // Task board, including its supports.
  footprint(1.98, -0.52, 2.95, 0.62),
  // Lounge couch, coffee table and sculpture.
  footprint(5.35, 3.73, 3.4, 1.3),
  footprint(5, 2.13, 1.7, 1.7),
  footprint(7.4, 3.97, 0.84, 1.05),
  // Training pedestal and repair workbench.
  footprint(4.55, -3.5, 1.56, 1.56),
  footprint(6.7, -0.2, 2.3, 1.4),
  // Freestanding sculpture beside the work floor.
  footprint(1.1, 4.65, 0.76, 0.9),
];

const WANDER_ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [3.25, 0.8], [2.55, 1.65], [2.35, 3.1], [2.55, 4.25], [2.2, 2.15],
  ],
  [
    [6.85, 1.55], [7.5, 1.5], [7.9, 1.9], [7.65, 2.4], [6.85, 2.3],
  ],
  [
    [2.35, -1.75], [2.6, -2.45], [2.45, -3.55], [1.8, -4.35], [1.1, -3.1], [1.55, -2],
  ],
];

function actorSeed(actorId: string) {
  let seed = 2166136261;
  for (let index = 0; index < actorId.length; index += 1) {
    seed ^= actorId.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function nextRandom(seedRef: MutableRefObject<number>) {
  seedRef.current = (Math.imul(seedRef.current, 1664525) + 1013904223) >>> 0;
  return seedRef.current / 4294967296;
}

function nearestWanderRoute(position: readonly [number, number, number]) {
  let nearestRouteIndex = 0;
  let nearestWaypointIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  WANDER_ROUTES.forEach((route, routeIndex) => route.forEach((waypoint, waypointIndex) => {
    const distance = Math.hypot(position[0] - waypoint[0], position[2] - waypoint[1]);
    if (distance >= nearestDistance) return;
    nearestDistance = distance;
    nearestRouteIndex = routeIndex;
    nearestWaypointIndex = waypointIndex;
  }));
  return { route: WANDER_ROUTES[nearestRouteIndex], waypointIndex: nearestWaypointIndex };
}

function constrainToRoom(point: CollisionPoint) {
  const normalized = point.x * point.x / (WORLD_RADIUS_X * WORLD_RADIUS_X)
    + point.z * point.z / (WORLD_RADIUS_Z * WORLD_RADIUS_Z);
  if (normalized <= 1) return;
  const scale = 1 / Math.sqrt(normalized);
  point.x *= scale;
  point.z *= scale;
}

function pushOutsideFurniture(point: CollisionPoint, actor?: { index: number; state: AgentOfficeState }) {
  for (const collider of STATIC_COLLIDERS) {
    const ownerIsWorking = actor
      && collider.allowsOwnerOccupancy
      && collider.ownerIndex === actor.index
      && (actor.state === 'executing' || actor.state === 'assigned');
    if (ownerIsWorking) continue;
    const minX = collider.minX - AGENT_COLLISION_RADIUS;
    const maxX = collider.maxX + AGENT_COLLISION_RADIUS;
    const minZ = collider.minZ - AGENT_COLLISION_RADIUS;
    const maxZ = collider.maxZ + AGENT_COLLISION_RADIUS;
    if (point.x <= minX || point.x >= maxX || point.z <= minZ || point.z >= maxZ) continue;

    const exits = [
      { axis: 'x' as const, value: minX - 0.02, distance: point.x - minX },
      { axis: 'x' as const, value: maxX + 0.02, distance: maxX - point.x },
      { axis: 'z' as const, value: minZ - 0.02, distance: point.z - minZ },
      { axis: 'z' as const, value: maxZ + 0.02, distance: maxZ - point.z },
    ];
    const nearestExit = exits.reduce((nearest, exit) => exit.distance < nearest.distance ? exit : nearest);
    point[nearestExit.axis] = nearestExit.value;
  }
  constrainToRoom(point);
}

function separatePoints(first: CollisionPoint, second: CollisionPoint, seed: number, firstWeight = 0.5) {
  let dx = first.x - second.x;
  let dz = first.z - second.z;
  let distance = Math.hypot(dx, dz);
  if (distance >= AGENT_MIN_DISTANCE) return;
  if (distance < 0.001) {
    const angle = seed * 2.399963;
    dx = Math.cos(angle);
    dz = Math.sin(angle);
    distance = 1;
  }
  const overlap = AGENT_MIN_DISTANCE - distance + 0.01;
  const nx = dx / distance;
  const nz = dz / distance;
  first.x += nx * overlap * firstWeight;
  first.z += nz * overlap * firstWeight;
  second.x -= nx * overlap * (1 - firstWeight);
  second.z -= nz * overlap * (1 - firstWeight);
}

function supportsWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function CameraRig({ focusPosition }: { focusPosition: [number, number, number] }) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const previousBaseZoomRef = useRef(0);
  const desiredLookAtRef = useRef(new Vector3());
  const focusVector = useMemo(() => new Vector3(focusPosition[0], focusPosition[1], focusPosition[2]), [focusPosition[0], focusPosition[1], focusPosition[2]]);
  const baseZoom = size.width < 520 ? (size.height > size.width * 1.35 ? 30 : 23) : size.width < 900 ? 35 : 43;

  useEffect(() => {
    const orthographic = camera as OrthographicCamera;
    orthographic.position.set(12.8, 14.6, 15.8);
    orthographic.lookAt(0, 0.1, 0);
    orthographic.updateProjectionMatrix();

    const controls = new OrbitControls(orthographic, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.rotateSpeed = 0.48;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.55;
    controls.enablePan = false;
    controls.minPolarAngle = MathUtils.degToRad(32);
    controls.maxPolarAngle = MathUtils.degToRad(72);
    controls.touches.ONE = TOUCH.ROTATE;
    controls.touches.TWO = TOUCH.DOLLY_PAN;
    controls.target.set(0, 0.16, 0);
    controls.update();
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const orthographic = camera as OrthographicCamera;
    const controls = controlsRef.current;
    const previousBaseZoom = previousBaseZoomRef.current;
    const relativeZoom = previousBaseZoom > 0 ? orthographic.zoom / previousBaseZoom : 1;
    orthographic.zoom = baseZoom * MathUtils.clamp(relativeZoom, 0.8, 1.2);
    orthographic.updateProjectionMatrix();
    if (controls) {
      controls.minZoom = baseZoom * 0.8;
      controls.maxZoom = baseZoom * 1.2;
      controls.update();
    }
    previousBaseZoomRef.current = baseZoom;
  }, [baseZoom, camera]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const focusWeight = size.width < 520 ? 0.07 : 0.14;
    desiredLookAtRef.current.set(focusVector.x * focusWeight, 0.16, focusVector.z * focusWeight);
    const smoothing = 1 - Math.exp(-delta * 3.2);
    controls.target.lerp(desiredLookAtRef.current, smoothing);
    controls.update();
  });
  return null;
}

function VoxelRing({ radius, color, y = 0.1, segments = 24 }: { radius: number; color: string; y?: number; segments?: number }) {
  return <group>
    {Array.from({ length: segments }, (_, index) => {
      const angle = index / segments * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * radius, y, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[Math.max(0.12, radius * 4.25 / segments), 0.055, 0.085]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
      </mesh>;
    })}
  </group>;
}

function RoomShell() {
  return <group>
    <mesh receiveShadow position={[0, -0.5, 0]} scale={[1, 1, 0.62]}>
      <cylinderGeometry args={[10.05, 10.45, 0.68, 12]} />
      <meshStandardMaterial color={SCENE_PALETTE.shell} roughness={0.88} metalness={0} />
    </mesh>
    <mesh receiveShadow position={[0, -0.11, 0]} scale={[1, 1, 0.62]}>
      <cylinderGeometry args={[9.72, 9.72, 0.16, 12]} />
      <meshStandardMaterial color={SCENE_PALETTE.floor} roughness={0.9} metalness={0} />
    </mesh>
    {Array.from({ length: 44 }, (_, index) => {
      const angle = index / 44 * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 9.32, 0.005, Math.sin(angle) * 5.77]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[0.34, 0.055, 0.1]} />
        <meshStandardMaterial color={index % 4 === 0 ? '#B7F34A' : SCENE_PALETTE.outline} roughness={0.88} metalness={0} />
      </mesh>;
    })}
    <mesh receiveShadow position={[-3.55, 0.015, -1.15]}>
      <boxGeometry args={[9.3, 0.07, 8.55]} />
      <meshStandardMaterial color={SCENE_PALETTE.workFloor} roughness={0.92} metalness={0} />
    </mesh>
    <mesh receiveShadow position={[5.2, 0.035, 2.82]}>
      <cylinderGeometry args={[3.05, 3.05, 0.08, 16]} />
      <meshStandardMaterial color={SCENE_PALETTE.lounge} roughness={0.92} metalness={0} />
    </mesh>
    <mesh receiveShadow position={[4.55, 0.04, -3.5]}>
      <cylinderGeometry args={[2.28, 2.28, 0.09, 16]} />
      <meshStandardMaterial color="#86C7D0" roughness={0.9} metalness={0} />
    </mesh>
    <mesh receiveShadow position={[-9.05, 1.05, -0.2]}>
      <boxGeometry args={[0.2, 2.35, 10.4]} />
      <meshStandardMaterial color={SCENE_PALETTE.wall} roughness={0.94} metalness={0} />
    </mesh>
    <mesh receiveShadow position={[0, 1.05, -5.55]}>
      <boxGeometry args={[18.2, 2.35, 0.2]} />
      <meshStandardMaterial color={SCENE_PALETTE.wall} roughness={0.94} metalness={0} />
    </mesh>
    {[-5.95, -2.05, 1.85, 5.75].map((x, index) => {
      const screenColors = ['#39D7E7', '#15252D', '#B7F34A', '#D99A2B'] as const;
      const screenColor = screenColors[index % screenColors.length];
      return <group key={x} position={[x, 1.34, -5.42]}>
        <mesh><boxGeometry args={[3.05, 1.42, 0.08]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.86} metalness={0} /></mesh>
        <mesh position={[0, 0, 0.052]}><boxGeometry args={[2.76, 1.13, 0.02]} /><meshStandardMaterial color={screenColor} roughness={0.9} metalness={0} /></mesh>
        {Array.from({ length: 11 }, (_, pixelIndex) => <mesh key={pixelIndex} position={[-1.08 + (pixelIndex % 6) * 0.38, 0.34 - Math.floor(pixelIndex / 6) * 0.42, 0.078]}>
          <boxGeometry args={[pixelIndex % 3 === 0 ? 0.28 : 0.18, 0.15, 0.025]} />
          <meshBasicMaterial color={pixelIndex % 2 ? '#F1F3EE' : '#101318'} />
        </mesh>)}
      </group>;
    })}
    {[-7.75, -5.15, -2.55, 0.05].map((x) => <mesh key={x} position={[x, 0.065, 3.05]}>
      <boxGeometry args={[0.045, 0.028, 3.75]} />
      <meshStandardMaterial color="#8FBFC2" roughness={0.9} metalness={0} />
    </mesh>)}
    {[-4.65, -2.25, 0.15].map((z) => <mesh key={z} position={[-4, 0.066, z]}>
      <boxGeometry args={[7.9, 0.028, 0.045]} />
      <meshStandardMaterial color="#8FBFC2" roughness={0.9} metalness={0} />
    </mesh>)}
    <BiophilicSculpture position={[1.1, 0, 4.65]} scale={0.9} />
  </group>;
}

function Workstation({ position, actor, selected, index, onSelect }: {
  position: [number, number];
  actor?: AgentOfficeActor;
  selected: boolean;
  index: number;
  onSelect?: () => void;
}) {
  const color = actor ? STATE_COLORS[actor.state] : '#687078';
  const personalColor = actor ? ACCENT_COLORS[actor.accent] : null;
  const palette = WORKSTATION_PALETTES[index % WORKSTATION_PALETTES.length];
  return <group position={[position[0], 0, position[1]]} onClick={actor ? (event) => { event.stopPropagation(); onSelect?.(); } : undefined}>
    <mesh receiveShadow position={[0, 0.035, 0.2]}>
      <boxGeometry args={[2.22, 0.04, 1.62]} />
      <meshStandardMaterial color={selected ? '#C4F35A' : personalColor ?? palette.mat} roughness={0.92} metalness={0} />
    </mesh>
    <mesh castShadow receiveShadow position={[0, 0.76, 0]}>
      <boxGeometry args={[2.08, 0.15, 0.96]} />
      <meshStandardMaterial color={selected ? '#08AAC4' : palette.desk} roughness={0.9} metalness={0} />
    </mesh>
    {[-0.82, 0.82].map((x) => <mesh castShadow key={x} position={[x, 0.35, 0]}>
      <boxGeometry args={[0.11, 0.72, 0.68]} />
      <meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} />
    </mesh>)}
    {actor ? <group position={[-0.72, 0.89, 0.34]}>
      {[0, 0.16, 0.32].map((x, pixelIndex) => <mesh castShadow key={x} position={[x, 0, 0]}>
        <boxGeometry args={[0.12, 0.09, 0.08]} />
        <meshStandardMaterial color={pixelIndex === 1 ? color : personalColor ?? color} roughness={0.88} metalness={0} />
      </mesh>)}
    </group> : null}
    <mesh castShadow position={[-0.18, 1.22, -0.25]}>
      <boxGeometry args={[1.08, 0.68, 0.1]} />
      <meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.86} metalness={0} />
    </mesh>
    <mesh position={[-0.18, 1.22, -0.192]}>
      <boxGeometry args={[0.88, 0.48, 0.018]} />
      <meshStandardMaterial color={actor ? '#EAF1EE' : '#D9DED6'} roughness={0.94} metalness={0} />
    </mesh>
    {[[-0.48, 1.28], [-0.34, 1.16], [-0.2, 1.34], [-0.06, 1.2], [0.08, 1.28]].map(([x, y], pixelIndex) => <mesh key={pixelIndex} position={[x, y, -0.176]}>
      <boxGeometry args={[0.08, 0.065, 0.018]} />
      <meshBasicMaterial color={pixelIndex === 2 ? color : actor ? ACCENT_COLORS[actor.accent] : '#8FA4A8'} />
    </mesh>)}
    <mesh castShadow position={[-0.18, 0.94, -0.22]}>
      <boxGeometry args={[0.08, 0.25, 0.08]} />
      <meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} />
    </mesh>
    <mesh position={[0.76, 0.88, -0.18]}>
      <boxGeometry args={[0.14, 0.14, 0.14]} />
      <meshStandardMaterial color={color} roughness={0.86} metalness={0} />
    </mesh>
    <mesh castShadow position={[0.03, 0.38, 0.92]} scale={[1, 1.08, 1]}>
      <boxGeometry args={[0.72, 0.64, 0.2]} />
      <meshStandardMaterial color={palette.chair} roughness={0.9} metalness={0} />
    </mesh>
    <mesh castShadow position={[0.02, 0.15, 0.8]}><boxGeometry args={[0.18, 0.32, 0.18]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} /></mesh>
    <mesh castShadow position={[0.55, 0.84, 0.08]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.08, 0.45, 0.08]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} /></mesh>
    <mesh position={[0.5, 1.08, 0.08]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.16, 0.16, 0.16]} /><meshStandardMaterial color="#C4F35A" roughness={0.86} metalness={0} /></mesh>
  </group>;
}

function TaskBoard() {
  return <group position={[1.98, 0, -0.52]} rotation={[0, -0.18, 0]}>
    <mesh receiveShadow position={[0, 0.03, 0.2]}><cylinderGeometry args={[1.72, 1.72, 0.06, 12]} /><meshStandardMaterial color="#9CCDD2" roughness={0.9} metalness={0} /></mesh>
    <VoxelRing radius={1.42} color="#08AAC4" y={0.08} segments={20} />
    <mesh castShadow position={[0, 1.62, 0]}>
      <boxGeometry args={[2.82, 2.08, 0.13]} />
      <meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} />
    </mesh>
    <mesh position={[0, 1.62, 0.095]}>
      <boxGeometry args={[2.52, 1.76, 0.025]} />
      <meshStandardMaterial color="#087D92" roughness={0.9} metalness={0} />
    </mesh>
    {[[-0.75, 1.94, '#39D7E7'], [0.05, 1.68, '#C4F35A'], [0.8, 2.02, '#D99A2B'], [-0.38, 1.15, '#F1F3EE']].map(([x, y, color], index) => <mesh key={index} position={[Number(x), Number(y), 0.13]}>
      <boxGeometry args={[0.55, 0.39, 0.028]} />
      <meshStandardMaterial color={String(color)} roughness={0.92} metalness={0} />
    </mesh>)}
    {[-1.05, 1.05].map((x) => <mesh castShadow key={x} position={[x, 0.54, 0]}><boxGeometry args={[0.14, 1.05, 0.14]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} /></mesh>)}
  </group>;
}

function Lounge() {
  return <group position={[5.35, 0, 3.05]}>
    <mesh receiveShadow position={[0, 0.055, 0]}><cylinderGeometry args={[2.65, 2.65, 0.08, 16]} /><meshStandardMaterial color="#CFE5B1" roughness={0.92} metalness={0} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.42, 0.68]}>
      <boxGeometry args={[3.05, 0.65, 1.16]} />
      <meshStandardMaterial color="#15252D" roughness={0.92} metalness={0} />
    </mesh>
    <mesh castShadow position={[0, 0.85, 1.08]}>
      <boxGeometry args={[3.05, 0.76, 0.25]} />
      <meshStandardMaterial color="#203640" roughness={0.92} metalness={0} />
    </mesh>
    {[-1.28, 1.28].map((x) => <mesh castShadow key={x} position={[x, 0.68, 0.65]}><boxGeometry args={[0.34, 0.58, 1.2]} /><meshStandardMaterial color="#0A1117" roughness={0.9} metalness={0} /></mesh>)}
    {[-0.72, 0.15, 0.78].map((x, index) => <mesh castShadow key={x} position={[x, 0.79, 0.38]} rotation={[0, 0, index % 2 ? 0.08 : -0.06]}><boxGeometry args={[0.62, 0.48, 0.18]} /><meshStandardMaterial color={['#C4F35A', '#39D7E7', '#F1F3EE'][index]} roughness={0.7} /></mesh>)}
    <mesh castShadow position={[-0.35, 0.34, -0.92]}>
      <cylinderGeometry args={[0.82, 0.72, 0.15, 12]} />
      <meshStandardMaterial color="#08AAC4" roughness={0.9} metalness={0} />
    </mesh>
    <mesh castShadow position={[-0.35, 0.16, -0.92]}><boxGeometry args={[0.16, 0.35, 0.16]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.9} metalness={0} /></mesh>
    <mesh position={[-0.7, 0.49, -0.9]}><boxGeometry args={[0.14, 0.14, 0.14]} /><meshStandardMaterial color="#C4F35A" roughness={0.88} metalness={0} /></mesh>
    <BiophilicSculpture position={[2.05, 0, 0.92]} scale={0.92} />
  </group>;
}

function BiophilicSculpture({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh castShadow position={[0, 0.24, 0]}><boxGeometry args={[0.54, 0.48, 0.54]} /><meshStandardMaterial color="#08AAC4" roughness={0.9} metalness={0} /></mesh>
    {[[0, 0.86, 0], [0.26, 0.73, 0], [-0.25, 0.72, 0.12], [0.1, 0.63, -0.23], [-0.08, 1.02, 0.04]].map((leaf, index) => <mesh castShadow key={index} position={leaf as [number, number, number]} rotation={[0, index * 0.5, index % 2 ? -0.18 : 0.18]}><boxGeometry args={[0.34, 0.48, 0.18]} /><meshStandardMaterial color={index % 2 ? '#78A83B' : '#B7F34A'} roughness={0.92} metalness={0} /></mesh>)}
  </group>;
}

function TrainingPad() {
  return <group position={[4.55, 0, -3.5]}>
    {[2.06, 1.48, 0.9].map((radius, index) => <VoxelRing key={radius} radius={radius} color={index === 1 ? SCENE_PALETTE.training : SCENE_PALETTE.cyan} y={0.1 + index * 0.04} segments={index === 2 ? 12 : 24} />)}
    <mesh castShadow position={[0, 0.5, 0]}><cylinderGeometry args={[0.6, 0.78, 0.85, 8]} /><meshStandardMaterial color="#15252D" roughness={0.9} metalness={0} /></mesh>
    <mesh position={[0, 1.12, 0]} rotation={[0, 0.3, 0]}><boxGeometry args={[0.52, 0.52, 0.52]} /><meshStandardMaterial color="#08AAC4" roughness={0.88} metalness={0} /></mesh>
    <mesh position={[0, 1.54, 0]} rotation={[0, -0.25, 0]}><boxGeometry args={[0.28, 0.28, 0.28]} /><meshStandardMaterial color="#C4F35A" roughness={0.88} metalness={0} /></mesh>
  </group>;
}

function RepairBay() {
  return <group position={[6.7, 0, -0.38]}>
    <mesh receiveShadow position={[0, 0.035, 0]}><boxGeometry args={[2.55, 0.06, 2.15]} /><meshStandardMaterial color="#E6A0A0" roughness={0.92} metalness={0} /></mesh>
    <mesh castShadow position={[0, 0.58, 0.18]}><boxGeometry args={[2.2, 0.16, 1.2]} /><meshStandardMaterial color="#D99A2B" roughness={0.88} metalness={0} /></mesh>
    {[-0.88, 0.88].map((x) => <mesh castShadow key={x} position={[x, 0.28, 0.18]}><boxGeometry args={[0.12, 0.58, 0.92]} /><meshStandardMaterial color="#49565C" roughness={0.9} metalness={0} /></mesh>)}
    <mesh position={[0, 1.52, -0.42]}><boxGeometry args={[1.86, 1.3, 0.12]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} /></mesh>
    <mesh position={[0, 1.52, -0.35]}><boxGeometry args={[1.58, 1.03, 0.025]} /><meshStandardMaterial color="#08AAC4" roughness={0.9} metalness={0} /></mesh>
    {[-0.52, 0, 0.52].map((x, index) => <mesh key={x} position={[x, 1.52, -0.315]}><boxGeometry args={[0.16, 0.16, 0.05]} /><meshStandardMaterial color={index === 1 ? '#D94F4F' : '#C4F35A'} roughness={0.88} metalness={0} /></mesh>)}
    <mesh castShadow position={[0.82, 0.84, 0.34]} rotation={[0, 0, -0.28]}><boxGeometry args={[0.08, 0.48, 0.08]} /><meshStandardMaterial color="#687078" roughness={0.9} metalness={0} /></mesh>
    <mesh position={[0.7, 1.08, 0.34]}><boxGeometry args={[0.18, 0.18, 0.18]} /><meshStandardMaterial color="#C4F35A" roughness={0.88} metalness={0} /></mesh>
  </group>;
}

function DataLink({ from, to, color, index, reducedMotion }: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  index: number;
  reducedMotion: boolean;
}) {
  const pulseRef = useRef<Mesh>(null);
  const pulsePositionRef = useRef(new Vector3());
  const curve = useMemo(() => {
    const startVector = new Vector3(...from);
    const endVector = new Vector3(...to);
    const control = startVector.clone().add(endVector).multiplyScalar(0.5);
    control.y += 0.95 + startVector.distanceTo(endVector) * 0.08;
    return new QuadraticBezierCurve3(startVector, control, endVector);
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  const pixels = useMemo(() => curve.getPoints(26).filter((_, pixelIndex) => pixelIndex % 2 === 0), [curve]);

  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const progress = reducedMotion ? 0.62 : (clock.elapsedTime * 0.34 + index * 0.23) % 1;
    const eased = progress * progress * (3 - 2 * progress);
    pulseRef.current.position.copy(curve.getPoint(eased, pulsePositionRef.current));
  });

  return <group>
    {pixels.map((position, pixelIndex) => <mesh key={pixelIndex} position={position}>
      <boxGeometry args={[pixelIndex % 3 === 0 ? 0.12 : 0.08, 0.08, 0.08]} />
      <meshBasicMaterial color={pixelIndex % 3 === 0 ? color : '#101318'} transparent opacity={pixelIndex % 3 === 0 ? 0.88 : 0.38} depthWrite={false} />
    </mesh>)}
    <mesh ref={pulseRef} position={from}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color={color} roughness={0.86} metalness={0} />
    </mesh>
  </group>;
}

function NetworkPulse({ reducedMotion }: { reducedMotion: boolean }) {
  const ringRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const progress = reducedMotion ? 0.45 : (clock.elapsedTime * 0.28) % 1;
    const scale = 0.65 + progress * 1.55;
    ringRef.current.scale.setScalar(scale);
  });

  return <group ref={ringRef} position={[1.98, 0.14, -0.32]}>
    {Array.from({ length: 20 }, (_, index) => {
      const angle = index / 20 * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 1.15, 0, Math.sin(angle) * 1.15]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[0.15, 0.04, 0.07]} />
        <meshBasicMaterial color={index % 4 === 0 ? '#C4F35A' : '#08AAC4'} transparent opacity={0.32} depthWrite={false} />
      </mesh>;
    })}
  </group>;
}

function AmbientParticles({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<Group>(null);
  const particles = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const angle = index * 2.399;
    const radius = 6.5 + (index % 4) * 0.72;
    return [Math.cos(angle) * radius, 0.75 + (index % 5) * 0.52, Math.sin(angle) * radius * 0.62] as [number, number, number];
  }), []);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || reducedMotion) return;
    groupRef.current.rotation.y += delta * 0.018;
    groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.06;
  });

  return <group ref={groupRef}>
    {particles.map((position, index) => <mesh key={index} position={position}>
      <boxGeometry args={[index % 3 === 0 ? 0.09 : 0.055, index % 3 === 0 ? 0.09 : 0.055, index % 3 === 0 ? 0.09 : 0.055]} />
      <meshBasicMaterial color={index % 4 === 0 ? '#C4F35A' : index % 3 === 0 ? '#39D7E7' : '#08AAC4'} transparent opacity={index % 3 === 0 ? 0.52 : 0.3} depthWrite={false} />
    </mesh>)}
  </group>;
}

function lookAtRotation(position: CollisionPoint, targetX: number, targetZ: number) {
  return Math.atan2(targetX - position.x, targetZ - position.z);
}

function basePlacementForActor(actor: AgentOfficeActor, index: number, zoneIndex: number): ActorPlacement {
  const desk = DESK_POSITIONS[index % DESK_POSITIONS.length];
  if (actor.state === 'executing') return { position: [desk[0], 0.08, desk[1] + 1.42], rotation: Math.PI };
  if (actor.state === 'assigned') {
    const position: [number, number, number] = [desk[0] + 0.45, 0.08, desk[1] + 1.42];
    return { position, rotation: Math.atan2(desk[0] - position[0], desk[1] - position[2]) };
  }
  if (actor.state === 'trial') {
    const target = TRIAL_POSITIONS[zoneIndex % TRIAL_POSITIONS.length];
    return { position: [target[0], 0.08, target[1]], rotation: Math.atan2(4.55 - target[0], -3.5 - target[1]) };
  }
  if (actor.state === 'attention') {
    const target = REPAIR_POSITIONS[zoneIndex % REPAIR_POSITIONS.length];
    return { position: [target[0], 0.08, target[1]], rotation: Math.atan2(6.7 - target[0], -0.2 - target[1]) };
  }
  const target = LOUNGE_POSITIONS[zoneIndex % LOUNGE_POSITIONS.length];
  return { position: [target[0], 0.08, target[1]], rotation: Math.atan2(5.2 - target[0], 3.05 - target[1]) };
}

function buildActorPlacements(actors: AgentOfficeActor[]): ActorPlacement[] {
  const zoneCounts = { lounge: 0, trial: 0, repair: 0 };
  const placements = actors.map((actor, index) => {
    const zone = actor.state === 'trial' ? 'trial' : actor.state === 'attention' ? 'repair' : 'lounge';
    const zoneIndex = actor.state === 'executing' || actor.state === 'assigned' ? index : zoneCounts[zone]++;
    return basePlacementForActor(actor, index, zoneIndex);
  });
  const points = placements.map((placement) => ({ x: placement.position[0], z: placement.position[2] }));

  for (let iteration = 0; iteration < 24; iteration += 1) {
    points.forEach((point, index) => pushOutsideFurniture(point, { index, state: actors[index].state }));
    for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
        const firstAnchored = actors[firstIndex].state === 'executing' || actors[firstIndex].state === 'assigned';
        const secondAnchored = actors[secondIndex].state === 'executing' || actors[secondIndex].state === 'assigned';
        const firstWeight = firstAnchored && !secondAnchored ? 0 : !firstAnchored && secondAnchored ? 1 : 0.5;
        separatePoints(points[firstIndex], points[secondIndex], firstIndex * 17 + secondIndex + 1, firstWeight);
      }
    }
    points.forEach((point, index) => {
      pushOutsideFurniture(point, { index, state: actors[index].state });
      constrainToRoom(point);
    });
  }

  return placements.map((placement, index) => {
    const point = points[index];
    const actor = actors[index];
    const rotation = actor.state === 'executing' || actor.state === 'assigned'
      ? placement.rotation
      : actor.state === 'trial'
        ? lookAtRotation(point, 4.55, -3.5)
        : actor.state === 'attention'
          ? lookAtRotation(point, 6.7, -0.2)
          : lookAtRotation(point, 5.2, 3.05);
    return { position: [point.x, placement.position[1], point.z], rotation };
  });
}

function AgentEmployee({ actor, index, placement, selected, reducedMotion, collisionRegistry, onSelect }: {
  actor: AgentOfficeActor;
  index: number;
  placement: ActorPlacement;
  selected: boolean;
  reducedMotion: boolean;
  collisionRegistry: MutableRefObject<Map<string, RegisteredActor>>;
  onSelect: () => void;
}) {
  const rootRef = useRef<Group>(null);
  const targetVector = useMemo(() => new Vector3(...placement.position), [placement.position]);
  const wanderSetup = useMemo(() => nearestWanderRoute(placement.position), [placement.position]);
  const initialPositionRef = useRef<[number, number, number]>(placement.position);
  const stateColor = STATE_COLORS[actor.state];
  const walkingRef = useRef(false);
  const [walking, setWalking] = useState(false);
  const randomSeedRef = useRef(actorSeed(actor.id));
  const wanderRouteRef = useRef(wanderSetup.route);
  const wanderIndexRef = useRef(wanderSetup.waypointIndex);
  const wanderDirectionRef = useRef((actorSeed(actor.id) & 1) === 0 ? 1 : -1);
  const wanderTargetRef = useRef(new Vector3(...placement.position));
  const nextWanderAtRef = useRef(0);
  const wanderPausedRef = useRef(true);
  const wanderingRef = useRef(false);
  const animation: NounEmployeeAnimation = walking ? 'walk' : 'idle';

  useEffect(() => {
    const seed = actorSeed(actor.id);
    randomSeedRef.current = seed;
    wanderRouteRef.current = wanderSetup.route;
    wanderIndexRef.current = wanderSetup.waypointIndex;
    wanderDirectionRef.current = (seed & 1) === 0 ? 1 : -1;
    wanderTargetRef.current.copy(targetVector);
    nextWanderAtRef.current = 0;
    wanderPausedRef.current = true;
    wanderingRef.current = false;
  }, [actor.id, targetVector, wanderSetup.route, wanderSetup.waypointIndex]);

  useEffect(() => {
    const group = rootRef.current;
    if (!group) return undefined;
    collisionRegistry.current.set(actor.id, { group, index, state: actor.state });
    return () => { collisionRegistry.current.delete(actor.id); };
  }, [actor.id, actor.state, collisionRegistry, index]);

  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;
    if (!root) return;
    const shouldWander = actor.state !== 'executing' && actor.state !== 'assigned' && !reducedMotion;

    if (shouldWander && !wanderingRef.current) {
      const nearest = nearestWanderRoute([root.position.x, root.position.y, root.position.z]);
      wanderRouteRef.current = nearest.route;
      wanderIndexRef.current = nearest.waypointIndex;
      wanderTargetRef.current.copy(root.position);
      nextWanderAtRef.current = clock.elapsedTime + 0.6 + nextRandom(randomSeedRef) * 0.8;
      wanderPausedRef.current = true;
      wanderingRef.current = true;
    } else if (!shouldWander && wanderingRef.current) {
      wanderingRef.current = false;
      wanderPausedRef.current = true;
    }

    if (shouldWander && wanderPausedRef.current && clock.elapsedTime >= nextWanderAtRef.current) {
      const route = wanderRouteRef.current;
      let nextIndex = wanderIndexRef.current + wanderDirectionRef.current;
      if (nextIndex < 0 || nextIndex >= route.length) {
        wanderDirectionRef.current *= -1;
        nextIndex = wanderIndexRef.current + wanderDirectionRef.current;
      }
      wanderIndexRef.current = MathUtils.clamp(nextIndex, 0, route.length - 1);
      const waypoint = route[wanderIndexRef.current];
      wanderTargetRef.current.set(waypoint[0], placement.position[1], waypoint[1]);
      wanderPausedRef.current = false;
    }

    const destination = shouldWander ? wanderTargetRef.current : targetVector;
    let distanceToTarget = root.position.distanceTo(destination);
    if (shouldWander && !wanderPausedRef.current && distanceToTarget <= 0.1) {
      wanderPausedRef.current = true;
      wanderTargetRef.current.copy(root.position);
      nextWanderAtRef.current = clock.elapsedTime + 1.4 + nextRandom(randomSeedRef) * 1.4;
      distanceToTarget = 0;
    }

    const isWalking = !reducedMotion && distanceToTarget > 0.08
      && (!shouldWander || !wanderPausedRef.current);
    if (isWalking !== walkingRef.current) {
      walkingRef.current = isWalking;
      setWalking(isWalking);
    }
    const directionX = destination.x - root.position.x;
    const directionZ = destination.z - root.position.z;
    if (reducedMotion) root.position.copy(targetVector);
    else if (isWalking) {
      const step = delta * (shouldWander ? 0.68 : 1.7);
      root.position.lerp(destination, Math.min(1, step / distanceToTarget));
    }
    for (let pass = 0; pass < COLLISION_SOLVER_PASSES; pass += 1) {
      pushOutsideFurniture(root.position, { index, state: actor.state });
      for (const registered of collisionRegistry.current.values()) {
        if (registered.index >= index || registered.group === root) continue;
        separatePoints(root.position, registered.group.position, index * 17 + registered.index + pass + 1);
        pushOutsideFurniture(root.position, { index, state: actor.state });
        pushOutsideFurniture(registered.group.position, { index: registered.index, state: registered.state });
      }
    }
    const desiredRotation = isWalking
      ? Math.atan2(directionX, directionZ)
      : shouldWander
        ? root.rotation.y
        : placement.rotation;
    const turnSmoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 7.5);
    root.rotation.y = MathUtils.lerp(root.rotation.y, desiredRotation, turnSmoothing);
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>, active: boolean) => {
    event.stopPropagation();
    document.body.style.cursor = active ? 'pointer' : '';
  };

  return <group ref={rootRef} position={initialPositionRef.current} rotation={[0, placement.rotation, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={(event) => handlePointer(event, true)} onPointerOut={(event) => handlePointer(event, false)}>
    {selected ? <VoxelRing radius={0.68} color={stateColor} y={0.07} segments={12} /> : null}
    <NounEmployeeModel accent={actor.accent} animation={animation} index={index} reducedMotion={reducedMotion} />
    <group position={[0, 2.05, 0]}>
      <mesh castShadow rotation={[0, Math.PI / 4, Math.PI / 4]}>
        <octahedronGeometry args={[selected ? 0.16 : 0.11, 0]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={selected ? 0.3 : 0.12} roughness={0.72} metalness={0} />
      </mesh>
    </group>
  </group>;
}

function OfficeWorld({ actors, placements, selectedId, reducedMotion, onSelect }: AgentOfficeCanvasProps & { placements: ActorPlacement[]; reducedMotion: boolean }) {
  const deskCount = Math.max(6, actors.length);
  const collisionRegistry = useRef<Map<string, RegisteredActor>>(new Map());
  const activeLinks = actors.flatMap((actor, index) => {
    if (actor.state === 'ready' || actor.state === 'paused') return [];
    const actorPosition = placements[index].position;
    const taskCore: [number, number, number] = [1.98, 2.08, -0.52];
    const desk = DESK_POSITIONS[index % DESK_POSITIONS.length];
    const endpoint: [number, number, number] = actor.state === 'assigned'
      ? [desk[0] - 0.18, 1.46, desk[1] - 0.2]
      : actor.state === 'trial'
        ? [4.55, 1.26, -3.5]
        : actor.state === 'attention'
          ? [6.7, 1.75, -0.38]
          : [actorPosition[0], 1.72, actorPosition[2]];
    return [{ actor, index, from: endpoint, target: taskCore }];
  });
  return <group>
    <AmbientParticles reducedMotion={reducedMotion} />
    <RoomShell />
    {DESK_POSITIONS.slice(0, deskCount).map((position, index) => <Workstation key={`${position[0]}-${position[1]}`} position={position} index={index} actor={actors[index]} selected={actors[index]?.id === selectedId} onSelect={actors[index] ? () => onSelect(actors[index].id) : undefined} />)}
    <TaskBoard />
    <Lounge />
    <TrainingPad />
    <RepairBay />
    <NetworkPulse reducedMotion={reducedMotion} />
    {activeLinks.map(({ actor, index, from, target }) => <DataLink key={actor.id} from={from} to={target} color={STATE_COLORS[actor.state]} index={index} reducedMotion={reducedMotion} />)}
    {actors.map((actor, index) => <AgentEmployee key={actor.id} actor={actor} index={index} placement={placements[index]} selected={actor.id === selectedId} reducedMotion={reducedMotion} collisionRegistry={collisionRegistry} onSelect={() => onSelect(actor.id)} />)}
  </group>;
}

function OfficeFallback({ actors, selectedId, onSelect }: AgentOfficeCanvasProps) {
  const zones: Array<{ state: AgentOfficeState; label: string }> = [
    { state: 'executing', label: '工位区' },
    { state: 'assigned', label: '任务台' },
    { state: 'ready', label: '休息区' },
    { state: 'trial', label: '训练场' },
    { state: 'attention', label: '维修位' },
    { state: 'paused', label: '休息区' },
  ];
  return <div className="agent-office-fallback" role="group" aria-label="Agent 办公室简化视图">
    {zones.map((zone, index) => <section key={`${zone.state}-${index}`}><span>{zone.label}</span>{actors.filter((actor) => actor.state === zone.state).map((actor) => <button type="button" key={actor.id} data-selected={actor.id === selectedId} onClick={() => onSelect(actor.id)}>{actor.name}<small>{actor.statusLabel}</small></button>)}</section>)}
  </div>;
}

export function AgentOfficeCanvas(props: AgentOfficeCanvasProps) {
  const reducedMotion = useReducedMotion();
  const [webglAvailable] = useState(supportsWebGL);
  const placements = useMemo(() => buildActorPlacements(props.actors), [props.actors]);
  const selectedIndex = props.actors.findIndex((actor) => actor.id === props.selectedId);
  const focusPosition = selectedIndex >= 0 ? placements[selectedIndex].position : [0, 0, 0] as [number, number, number];

  if (!webglAvailable) return <OfficeFallback {...props} />;

  return <div className="agent-office-canvas" aria-label="Agent 数字孪生运营空间">
    <Canvas
      orthographic
      shadows
      onPointerMissed={() => props.onClearSelection?.()}
      dpr={[1, 1.5]}
      camera={{ position: [12.8, 14.6, 15.8], zoom: 43, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[SCENE_PALETTE.background]} />
      <fog attach="fog" args={[SCENE_PALETTE.background, 29, 50]} />
      <ambientLight intensity={1.7} />
      <hemisphereLight args={['#F5FFFA', '#93B5B0', 2.1]} />
      <directionalLight castShadow position={[7, 14, 10]} intensity={3.3} color="#F8FFFC" shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={1} shadow-camera-far={38} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <CameraRig focusPosition={focusPosition} />
      <OfficeWorld {...props} placements={placements} reducedMotion={reducedMotion} />
    </Canvas>
    <div className="agent-office-hud" aria-hidden="true">
      <span>PINME-MESH / NOUNISH OPS</span>
      <strong><i />SYNCHRONIZED · {props.actors.length} DIGITAL WORKERS</strong>
    </div>
    <div className="agent-office-legend" aria-hidden="true">
      <span data-zone="work">工位</span>
      <span data-zone="task">任务台</span>
      <span data-zone="lounge">休息区</span>
      <span data-zone="training">训练场</span>
      <span data-zone="repair">维修位</span>
    </div>
  </div>;
}
