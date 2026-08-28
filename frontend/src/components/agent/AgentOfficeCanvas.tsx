import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Group, MathUtils, Mesh, OrthographicCamera, QuadraticBezierCurve3, Vector3 } from 'three';

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

const ACTOR_PALETTES: Record<AgentOfficeActor['accent'], { shell: string; body: string; limb: string; trait: string; noggle: string }> = {
  cyan: { shell: '#39D7E7', body: '#08AAC4', limb: '#0C6678', trait: '#B7F34A', noggle: '#101318' },
  lime: { shell: '#B7F34A', body: '#7BAE35', limb: '#476B25', trait: '#39D7E7', noggle: '#101318' },
  amber: { shell: '#E2AC48', body: '#D99A2B', limb: '#8A5F18', trait: '#39D7E7', noggle: '#101318' },
};

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

const LOUNGE_POSITIONS: Array<[number, number]> = [[4.85, 3.45], [6.3, 2.72], [5.72, 4.25]];
const TASK_POSITIONS: Array<[number, number]> = [[0.78, -0.15], [3.08, 0.05], [1.24, 1.55]];
const TRIAL_POSITIONS: Array<[number, number]> = [[3.92, -3.68], [5.18, -3.48], [4.55, -2.72]];
const REPAIR_POSITIONS: Array<[number, number]> = [[6.75, -0.62], [6.08, 0.08]];

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

function CameraRig({ focusPosition, tourEnabled }: { focusPosition: [number, number, number]; tourEnabled: boolean }) {
  const { camera, size } = useThree();
  const lookAtRef = useRef(new Vector3());
  const desiredPositionRef = useRef(new Vector3());
  const desiredLookAtRef = useRef(new Vector3());
  const focusVector = useMemo(() => new Vector3(focusPosition[0], focusPosition[1], focusPosition[2]), [focusPosition[0], focusPosition[1], focusPosition[2]]);
  const baseZoom = size.width < 520 ? 23 : size.width < 900 ? 35 : 43;

  useEffect(() => {
    const orthographic = camera as OrthographicCamera;
    orthographic.zoom = baseZoom;
    orthographic.position.set(12.8, 14.6, 15.8);
    orthographic.lookAt(0, 0.1, 0);
    orthographic.updateProjectionMatrix();
  }, [baseZoom, camera]);

  useFrame((_state, delta) => {
    const orthographic = camera as OrthographicCamera;
    const focusWeight = size.width < 520 ? 0.07 : tourEnabled ? 0.22 : 0.14;
    desiredPositionRef.current.set(12.8 + focusVector.x * focusWeight, 14.6, 15.8 + focusVector.z * focusWeight);
    desiredLookAtRef.current.set(focusVector.x * focusWeight, 0.16, focusVector.z * focusWeight);
    const smoothing = 1 - Math.exp(-delta * (tourEnabled ? 1.8 : 3.2));
    orthographic.position.lerp(desiredPositionRef.current, smoothing);
    lookAtRef.current.lerp(desiredLookAtRef.current, smoothing);
    orthographic.lookAt(lookAtRef.current);
    orthographic.zoom = MathUtils.lerp(orthographic.zoom, baseZoom + (tourEnabled && size.width >= 520 ? 1.4 : 0), smoothing);
    orthographic.updateProjectionMatrix();
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
  const palette = WORKSTATION_PALETTES[index % WORKSTATION_PALETTES.length];
  return <group position={[position[0], 0, position[1]]} onClick={actor ? (event) => { event.stopPropagation(); onSelect?.(); } : undefined}>
    <mesh receiveShadow position={[0, 0.035, 0.2]}>
      <boxGeometry args={[2.22, 0.04, 1.62]} />
      <meshStandardMaterial color={selected ? '#C4F35A' : palette.mat} roughness={0.92} metalness={0} />
    </mesh>
    <mesh castShadow receiveShadow position={[0, 0.76, 0]}>
      <boxGeometry args={[2.08, 0.15, 0.96]} />
      <meshStandardMaterial color={selected ? '#08AAC4' : palette.desk} roughness={0.9} metalness={0} />
    </mesh>
    {[-0.82, 0.82].map((x) => <mesh castShadow key={x} position={[x, 0.35, 0]}>
      <boxGeometry args={[0.11, 0.72, 0.68]} />
      <meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.88} metalness={0} />
    </mesh>)}
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

function positionForActor(actor: AgentOfficeActor, index: number): { position: [number, number, number]; rotation: number; sitting: boolean } {
  const desk = DESK_POSITIONS[index % DESK_POSITIONS.length];
  if (actor.state === 'executing') return { position: [desk[0], 0.08, desk[1] + 0.78], rotation: Math.PI, sitting: true };
  if (actor.state === 'assigned') {
    const target = TASK_POSITIONS[index % TASK_POSITIONS.length];
    return { position: [target[0], 0.08, target[1]], rotation: Math.atan2(1.98 - target[0], -0.52 - target[1]), sitting: false };
  }
  if (actor.state === 'trial') {
    const target = TRIAL_POSITIONS[index % TRIAL_POSITIONS.length];
    return { position: [target[0], 0.08, target[1]], rotation: Math.atan2(4.55 - target[0], -3.5 - target[1]), sitting: false };
  }
  if (actor.state === 'attention') {
    const target = REPAIR_POSITIONS[index % REPAIR_POSITIONS.length];
    return { position: [target[0], 0.08, target[1]], rotation: 1.1, sitting: false };
  }
  const target = LOUNGE_POSITIONS[index % LOUNGE_POSITIONS.length];
  return { position: [target[0], actor.state === 'paused' ? 0.18 : 0.08, target[1]], rotation: -1.7, sitting: actor.state === 'paused' };
}

function NoggleFrame({ x, frame, lens }: { x: number; frame: string; lens: string }) {
  return <group position={[x, 0.69, 0.235]}>
    <mesh position={[0, 0, -0.012]}><boxGeometry args={[0.24, 0.18, 0.04]} /><meshStandardMaterial color={lens} roughness={0.92} metalness={0} /></mesh>
    {[[0, 0.095, 0.27, 0.055], [0, -0.095, 0.27, 0.055], [-0.135, 0, 0.055, 0.23], [0.135, 0, 0.055, 0.23]].map(([barX, barY, width, height], index) => <mesh key={index} position={[barX, barY, 0.02]}>
      <boxGeometry args={[width, height, 0.075]} />
      <meshStandardMaterial color={frame} roughness={0.86} metalness={0} />
    </mesh>)}
    <mesh position={[0.04, 0.035, 0.038]}><boxGeometry args={[0.06, 0.05, 0.02]} /><meshBasicMaterial color="#F1F3EE" /></mesh>
  </group>;
}

const HEAD_SHAPES = [
  [
    { x: -0.04, y: 0.93, width: 0.48 },
    { x: 0, y: 0.79, width: 0.68 },
    { x: 0, y: 0.65, width: 0.72 },
    { x: 0.05, y: 0.51, width: 0.56 },
  ],
  [
    { x: 0, y: 0.98, width: 0.34 },
    { x: -0.03, y: 0.85, width: 0.54 },
    { x: 0.03, y: 0.71, width: 0.72 },
    { x: 0, y: 0.57, width: 0.68 },
    { x: 0.06, y: 0.44, width: 0.46 },
  ],
  [
    { x: -0.08, y: 0.92, width: 0.56 },
    { x: 0, y: 0.78, width: 0.82 },
    { x: 0.02, y: 0.64, width: 0.82 },
    { x: 0.1, y: 0.5, width: 0.58 },
  ],
  [
    { x: 0.08, y: 0.94, width: 0.44 },
    { x: -0.04, y: 0.8, width: 0.68 },
    { x: 0.04, y: 0.66, width: 0.76 },
    { x: -0.08, y: 0.52, width: 0.54 },
  ],
] as const;

function PixelHeadShell({ index, color }: { index: number; color: string }) {
  const rows = HEAD_SHAPES[index % HEAD_SHAPES.length];
  return <group>
    {rows.map((row, rowIndex) => <mesh castShadow key={rowIndex} position={[row.x, row.y, 0]}>
      <boxGeometry args={[row.width, 0.155, 0.38]} />
      <meshStandardMaterial color={color} roughness={0.92} metalness={0} />
    </mesh>)}
  </group>;
}

function VoxelHeadTrait({ index, color }: { index: number; color: string }) {
  const trait = index % 4;
  if (trait === 0) return <group>
    <mesh castShadow position={[-0.04, 1.04, -0.01]}><boxGeometry args={[0.52, 0.14, 0.4]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} /></mesh>
    <mesh castShadow position={[0.2, 0.98, 0.08]}><boxGeometry args={[0.32, 0.1, 0.28]} /><meshStandardMaterial color="#39D7E7" roughness={0.9} metalness={0} /></mesh>
  </group>;
  if (trait === 1) return <group>
    {[-0.2, 0, 0.2].map((x, blockIndex) => <mesh castShadow key={x} position={[x, 1.08 + (blockIndex === 1 ? 0.08 : 0), 0]}>
      <boxGeometry args={[0.15, blockIndex === 1 ? 0.3 : 0.22, 0.3]} /><meshStandardMaterial color={blockIndex === 1 ? '#C4F35A' : color} roughness={0.9} metalness={0} />
    </mesh>)}
    <mesh castShadow position={[0, 1.01, 0]}><boxGeometry args={[0.56, 0.1, 0.3]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} /></mesh>
  </group>;
  if (trait === 2) return <group>
    <mesh castShadow position={[-0.06, 1.1, 0]}><boxGeometry args={[0.08, 0.3, 0.16]} /><meshStandardMaterial color={SCENE_PALETTE.outline} roughness={0.9} metalness={0} /></mesh>
    <mesh castShadow position={[-0.06, 1.28, 0]}><boxGeometry args={[0.19, 0.19, 0.24]} /><meshStandardMaterial color={color} roughness={0.88} metalness={0} /></mesh>
  </group>;
  return <group>
    {[[-0.2, 1.05, 0], [0, 1.14, 0], [0.2, 1.05, 0]].map((position, blockIndex) => <mesh castShadow key={blockIndex} position={position as [number, number, number]} rotation={[0, 0, blockIndex === 1 ? 0 : blockIndex === 0 ? -0.22 : 0.22]}>
      <boxGeometry args={[0.18, blockIndex === 1 ? 0.3 : 0.24, 0.28]} /><meshStandardMaterial color={blockIndex === 1 ? '#39D7E7' : color} roughness={0.9} metalness={0} />
    </mesh>)}
  </group>;
}

function NounTorso({ body, shell, trait, stateColor }: { body: string; shell: string; trait: string; stateColor: string }) {
  return <group>
    <mesh castShadow position={[0, 0.08, 0]} scale={[1, 1.05, 0.78]}>
      <capsuleGeometry args={[0.27, 0.18, 5, 8]} />
      <meshStandardMaterial color={body} roughness={0.9} metalness={0} flatShading />
    </mesh>
    <mesh castShadow position={[0, 0.3, 0]} scale={[1.15, 0.48, 0.82]}>
      <sphereGeometry args={[0.28, 8, 6]} />
      <meshStandardMaterial color={body} roughness={0.9} metalness={0} flatShading />
    </mesh>
    {[[-0.12, 0.17, stateColor], [0.02, 0.17, shell], [-0.12, 0.03, shell], [0.02, 0.03, trait]].map(([x, y, color], pixelIndex) => <mesh key={pixelIndex} position={[Number(x), Number(y), 0.245]}>
      <boxGeometry args={[0.1, 0.1, 0.035]} />
      <meshStandardMaterial color={String(color)} roughness={0.9} metalness={0} />
    </mesh>)}
  </group>;
}

function JointedArm({ side, color, shell, armRef }: { side: -1 | 1; color: string; shell: string; armRef: RefObject<Group> }) {
  return <group ref={armRef} position={[side * 0.34, 0.25, 0]}>
    <mesh castShadow position={[0, -0.11, 0]}><capsuleGeometry args={[0.075, 0.13, 4, 7]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} flatShading /></mesh>
    <group position={[0, -0.24, 0.015]} rotation={[0, 0, side * -0.5]}>
      <mesh castShadow position={[0, -0.1, 0]}><capsuleGeometry args={[0.07, 0.11, 4, 7]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} flatShading /></mesh>
      <mesh castShadow position={[0, -0.23, 0.025]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color={shell} roughness={0.88} metalness={0} flatShading /></mesh>
    </group>
  </group>;
}

function NounLeg({ side, sitting, color, shoe }: { side: -1 | 1; sitting: boolean; color: string; shoe: string }) {
  return <group position={[side * 0.13, -0.17, 0]} rotation={[sitting ? -0.92 : 0, 0, side * 0.04]}>
    <mesh castShadow position={[0, -0.12, 0]}><capsuleGeometry args={[0.085, 0.13, 4, 7]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} flatShading /></mesh>
    <mesh castShadow position={[side * 0.025, -0.31, 0.075]} scale={[1.35, 0.68, 1.65]}><sphereGeometry args={[0.13, 8, 6]} /><meshStandardMaterial color={shoe} roughness={0.88} metalness={0} flatShading /></mesh>
  </group>;
}

function AgentStateProp({ state, color }: { state: AgentOfficeState; color: string }) {
  if (state === 'assigned') return <group position={[0.38, 0.09, 0.3]} rotation={[0.08, -0.18, -0.08]}>
    <mesh castShadow><boxGeometry args={[0.24, 0.32, 0.055]} /><meshStandardMaterial color="#F1F3EE" roughness={0.92} metalness={0} /></mesh>
    {[0.08, -0.02, -0.12].map((y, index) => <mesh key={y} position={[index === 2 ? -0.02 : 0.02, y, 0.034]}><boxGeometry args={[index === 2 ? 0.12 : 0.16, 0.035, 0.02]} /><meshBasicMaterial color={index === 0 ? color : '#101318'} /></mesh>)}
  </group>;
  if (state === 'ready' || state === 'paused') return <group position={[0.38, 0.02, 0.29]}>
    <mesh castShadow><boxGeometry args={[0.16, 0.19, 0.16]} /><meshStandardMaterial color="#F1F3EE" roughness={0.92} metalness={0} /></mesh>
    <mesh position={[0.11, 0, 0]}><boxGeometry args={[0.07, 0.1, 0.08]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} /></mesh>
    <mesh position={[0, 0.1, 0.085]}><boxGeometry args={[0.1, 0.035, 0.025]} /><meshBasicMaterial color={color} /></mesh>
  </group>;
  if (state === 'trial') return <group position={[0, 0.13, 0.31]} rotation={[0, 0, Math.PI / 4]}>
    <mesh castShadow><boxGeometry args={[0.24, 0.24, 0.07]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} /></mesh>
    <mesh position={[0, 0, 0.045]}><boxGeometry args={[0.1, 0.1, 0.025]} /><meshBasicMaterial color="#101318" /></mesh>
  </group>;
  if (state === 'attention') return <group position={[0.38, 0.03, 0.29]} rotation={[0, 0, -0.45]}>
    <mesh><boxGeometry args={[0.07, 0.44, 0.08]} /><meshStandardMaterial color="#687078" roughness={0.9} metalness={0} /></mesh>
    <mesh position={[0, 0.22, 0]}><boxGeometry args={[0.22, 0.1, 0.09]} /><meshStandardMaterial color={color} roughness={0.9} metalness={0} /></mesh>
  </group>;
  return null;
}

function AgentEmployee({ actor, index, selected, reducedMotion, onSelect }: {
  actor: AgentOfficeActor;
  index: number;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
}) {
  const rootRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const target = useMemo(() => positionForActor(actor, index), [actor, index]);
  const targetVector = useMemo(() => new Vector3(...target.position), [target.position]);
  const actorPalette = ACTOR_PALETTES[actor.accent];
  const stateColor = STATE_COLORS[actor.state];

  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return;
    const speed = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.6);
    root.position.lerp(targetVector, speed);
    root.rotation.y = MathUtils.lerp(root.rotation.y, target.rotation, speed);
    const time = clock.elapsedTime + index * 0.71;
    const activeMotion = reducedMotion ? 0 : actor.state === 'executing' ? Math.sin(time * 7) * 0.025 : Math.sin(time * 2.2) * 0.028;
    body.position.y = (target.sitting ? 0.72 : 0.86) + activeMotion;
    body.rotation.z = actor.state === 'paused' ? -0.1 : Math.sin(time * 1.5) * (reducedMotion ? 0 : 0.022);
    if (headRef.current) {
      headRef.current.rotation.y = reducedMotion ? 0 : Math.sin(time * 0.82) * 0.11;
      headRef.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 1.2) * 0.025;
    }
    if (leftArmRef.current && rightArmRef.current) {
      const gesture = reducedMotion ? 0 : Math.sin(time * (actor.state === 'executing' ? 8 : 2.4));
      let leftPose = -0.08;
      let rightPose = 0.08;
      if (actor.state === 'executing') {
        leftPose = -0.48 + gesture * 0.08;
        rightPose = 0.48 - gesture * 0.08;
      } else if (actor.state === 'assigned') {
        leftPose = -0.18;
        rightPose = 0.62 + gesture * 0.08;
      } else if (actor.state === 'ready') {
        leftPose = -0.12;
        rightPose = 2.38 + gesture * 0.16;
      } else if (actor.state === 'trial') {
        leftPose = -2.25 - gesture * 0.08;
        rightPose = 2.25 + gesture * 0.08;
      } else if (actor.state === 'attention') {
        leftPose = -0.28;
        rightPose = 1.02 + gesture * 0.1;
      }
      const poseSmoothing = 1 - Math.exp(-delta * 6);
      leftArmRef.current.rotation.z = MathUtils.lerp(leftArmRef.current.rotation.z, leftPose, poseSmoothing);
      rightArmRef.current.rotation.z = MathUtils.lerp(rightArmRef.current.rotation.z, rightPose, poseSmoothing);
      const typing = actor.state === 'executing' ? gesture * 0.18 : 0;
      leftArmRef.current.rotation.x = typing;
      rightArmRef.current.rotation.x = -typing;
    }
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>, active: boolean) => {
    event.stopPropagation();
    document.body.style.cursor = active ? 'pointer' : '';
  };

  return <group ref={rootRef} position={target.position} rotation={[0, target.rotation, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={(event) => handlePointer(event, true)} onPointerOut={(event) => handlePointer(event, false)}>
    {selected ? <VoxelRing radius={0.72} color={stateColor} y={0.07} segments={12} /> : null}
    <group ref={bodyRef} position={[0, target.sitting ? 0.72 : 0.86, 0]}>
      <group ref={headRef}>
        <PixelHeadShell index={index} color={actorPalette.shell} />
        <VoxelHeadTrait index={index} color={actorPalette.trait} />
        <NoggleFrame x={-0.155} frame={actorPalette.noggle} lens="#15252D" />
        <NoggleFrame x={0.155} frame={actorPalette.noggle} lens="#15252D" />
        <mesh position={[0, 0.69, 0.278]}><boxGeometry args={[0.09, 0.055, 0.08]} /><meshStandardMaterial color={actorPalette.noggle} roughness={0.86} metalness={0} /></mesh>
      </group>
      <NounTorso body={actorPalette.body} shell={actorPalette.shell} trait={actorPalette.trait} stateColor={stateColor} />
      <JointedArm side={-1} color={actorPalette.limb} shell={actorPalette.shell} armRef={leftArmRef} />
      <JointedArm side={1} color={actorPalette.limb} shell={actorPalette.shell} armRef={rightArmRef} />
      <NounLeg side={-1} sitting={target.sitting} color={actorPalette.limb} shoe={SCENE_PALETTE.outline} />
      <NounLeg side={1} sitting={target.sitting} color={actorPalette.limb} shoe={SCENE_PALETTE.outline} />
      <AgentStateProp state={actor.state} color={stateColor} />
    </group>
    <mesh position={[0, 2.16, 0]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[0.17, 0.17, 0.17]} /><meshStandardMaterial color={stateColor} roughness={0.86} metalness={0} /></mesh>
  </group>;
}

function OfficeWorld({ actors, selectedId, reducedMotion, onSelect }: AgentOfficeCanvasProps & { reducedMotion: boolean }) {
  const worldRef = useRef<Group>(null);
  useFrame(({ pointer }, delta) => {
    if (!worldRef.current || reducedMotion) return;
    worldRef.current.rotation.y = MathUtils.lerp(worldRef.current.rotation.y, pointer.x * 0.035, 1 - Math.exp(-delta * 3));
    worldRef.current.rotation.x = MathUtils.lerp(worldRef.current.rotation.x, -pointer.y * 0.012, 1 - Math.exp(-delta * 3));
  });
  const deskCount = Math.max(6, actors.length);
  const activeLinks = actors.flatMap((actor, index) => {
    if (actor.state === 'ready' || actor.state === 'paused') return [];
    const actorPosition = positionForActor(actor, index).position;
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
  return <group ref={worldRef}>
    <AmbientParticles reducedMotion={reducedMotion} />
    <RoomShell />
    {DESK_POSITIONS.slice(0, deskCount).map((position, index) => <Workstation key={`${position[0]}-${position[1]}`} position={position} index={index} actor={actors[index]} selected={actors[index]?.id === selectedId} onSelect={actors[index] ? () => onSelect(actors[index].id) : undefined} />)}
    <TaskBoard />
    <Lounge />
    <TrainingPad />
    <RepairBay />
    <NetworkPulse reducedMotion={reducedMotion} />
    {activeLinks.map(({ actor, index, from, target }) => <DataLink key={actor.id} from={from} to={target} color={STATE_COLORS[actor.state]} index={index} reducedMotion={reducedMotion} />)}
    {actors.map((actor, index) => <AgentEmployee key={actor.id} actor={actor} index={index} selected={actor.id === selectedId} reducedMotion={reducedMotion} onSelect={() => onSelect(actor.id)} />)}
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
  const [tourEnabled, setTourEnabled] = useState(false);
  const selectedIndex = Math.max(0, props.actors.findIndex((actor) => actor.id === props.selectedId));
  const selectedActor = props.actors[selectedIndex] ?? props.actors[0];
  const focusPosition = selectedActor ? positionForActor(selectedActor, selectedIndex).position : [0, 0, 0] as [number, number, number];

  useEffect(() => {
    if (!tourEnabled || props.actors.length < 2) return;
    const timer = window.setInterval(() => {
      const currentIndex = props.actors.findIndex((actor) => actor.id === props.selectedId);
      const nextActor = props.actors[(Math.max(0, currentIndex) + 1) % props.actors.length];
      if (nextActor) props.onSelect(nextActor.id);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [props.actors, props.onSelect, props.selectedId, tourEnabled]);

  useEffect(() => {
    if (reducedMotion) setTourEnabled(false);
  }, [reducedMotion]);

  if (!webglAvailable) return <OfficeFallback {...props} />;

  return <div className="agent-office-canvas" aria-label="Agent 数字孪生运营空间">
    <Canvas
      orthographic
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [12.8, 14.6, 15.8], zoom: 43, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[SCENE_PALETTE.background]} />
      <fog attach="fog" args={[SCENE_PALETTE.background, 29, 50]} />
      <ambientLight intensity={1.7} />
      <hemisphereLight args={['#F5FFFA', '#93B5B0', 2.1]} />
      <directionalLight castShadow position={[7, 14, 10]} intensity={3.3} color="#F8FFFC" shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={1} shadow-camera-far={38} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <CameraRig focusPosition={focusPosition} tourEnabled={tourEnabled} />
      <OfficeWorld {...props} reducedMotion={reducedMotion} />
    </Canvas>
    <div className="agent-office-hud" aria-hidden="true">
      <span>PINME-MESH / NOUNISH OPS</span>
      <strong><i />SYNCHRONIZED · {props.actors.length} DIGITAL WORKERS</strong>
    </div>
    {selectedActor ? <div className="agent-office-command">
      <div className="agent-office-focus">
        <span>FOCUS / DIGITAL TWIN</span>
        <strong>{selectedActor.name}</strong>
        <small>{selectedActor.statusLabel}</small>
      </div>
      <button type="button" aria-pressed={tourEnabled} disabled={reducedMotion} title={reducedMotion ? '系统已开启减少动态效果' : undefined} onClick={() => setTourEnabled((enabled) => !enabled)}>
        <i />{tourEnabled ? '停止巡航' : '演示巡航'}
      </button>
    </div> : null}
    <div className="agent-office-legend" aria-hidden="true">
      <span data-zone="work">工位</span>
      <span data-zone="task">任务台</span>
      <span data-zone="lounge">休息区</span>
      <span data-zone="training">训练场</span>
      <span data-zone="repair">维修位</span>
    </div>
  </div>;
}
