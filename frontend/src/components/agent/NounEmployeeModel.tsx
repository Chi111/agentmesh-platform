import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AnimationClip,
  AnimationMixer,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  Object3D,
  PropertyBinding,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type NounEmployeeAnimation = 'idle' | 'walk';

interface NounEmployeeModelProps {
  accent: 'cyan' | 'lime' | 'amber';
  animation: NounEmployeeAnimation;
  index: number;
  reducedMotion: boolean;
}

const BODY_MODEL_URL = '/models/3d-nouns/body.glb';
const HEAD_MODEL_URLS = [
  '/models/3d-nouns/HeadBonsai.glb',
  '/models/3d-nouns/HeadBrain.glb',
  '/models/3d-nouns/HeadApe.glb',
] as const;

const BODY_PALETTES: Record<NounEmployeeModelProps['accent'], Record<'body' | 'hands' | 'legs' | 'shoes', string>> = {
  cyan: { body: '#08AAC4', hands: '#79DCE7', legs: '#DCEBE7', shoes: '#B7F34A' },
  lime: { body: '#8BBB3F', hands: '#C9F379', legs: '#DCEBE7', shoes: '#39D7E7' },
  amber: { body: '#D99A2B', hands: '#F0C46C', legs: '#DCEBE7', shoes: '#39D7E7' },
};

function prepareModel(source: Object3D, palette?: NounEmployeeModelProps['accent']) {
  const model = cloneSkeleton(source);
  model.traverse((object) => {
    if (object.type === 'Camera' || object.type.endsWith('Light')) {
      object.visible = false;
      return;
    }

    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone() as MeshStandardMaterial;
      const bodyColor = palette ? BODY_PALETTES[palette][mesh.name as keyof typeof BODY_PALETTES.cyan] : undefined;
      if (bodyColor) {
        material.map = null;
        material.color.set(bodyColor);
        material.needsUpdate = true;
      } else if (material.map) {
        material.map = material.map.clone();
        material.map.magFilter = NearestFilter;
        material.map.minFilter = NearestMipmapNearestFilter;
        material.map.needsUpdate = true;
      }
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
  });
  return model;
}

function animationsForModel(animations: AnimationClip[], model: Object3D) {
  return animations.map((animation) => {
    const tracks = animation.tracks.filter((track) => {
      const nodeName = PropertyBinding.parseTrackName(track.name).nodeName;
      return Boolean(nodeName && model.getObjectByName(nodeName));
    });
    return new AnimationClip(animation.name, animation.duration, tracks);
  });
}

export function NounEmployeeModel({ accent, animation, index, reducedMotion }: NounEmployeeModelProps) {
  const bodySource = useLoader(GLTFLoader, BODY_MODEL_URL);
  const headSource = useLoader(GLTFLoader, HEAD_MODEL_URLS[index % HEAD_MODEL_URLS.length]);
  const body = useMemo(() => prepareModel(bodySource.scene, accent), [accent, bodySource.scene]);
  const head = useMemo(() => prepareModel(headSource.scene), [headSource.scene]);
  const bodyMixer = useMemo(() => new AnimationMixer(body), [body]);
  const headMixer = useMemo(() => new AnimationMixer(head), [head]);
  const headAnimations = useMemo(() => animationsForModel(bodySource.animations, head), [bodySource.animations, head]);
  const activeAnimationRef = useRef(animation);

  useEffect(() => {
    const bodyClip = AnimationClip.findByName(bodySource.animations, animation)
      ?? AnimationClip.findByName(bodySource.animations, 'idle');
    const headClip = AnimationClip.findByName(headAnimations, animation)
      ?? AnimationClip.findByName(headAnimations, 'idle');
    if (!bodyClip || !headClip) return;

    const bodyAction = bodyMixer.clipAction(bodyClip);
    const headAction = headMixer.clipAction(headClip);
    bodyAction.reset().fadeIn(activeAnimationRef.current === animation ? 0 : 0.18).play();
    headAction.reset().fadeIn(activeAnimationRef.current === animation ? 0 : 0.18).play();
    activeAnimationRef.current = animation;

    return () => {
      bodyAction.fadeOut(0.18);
      headAction.fadeOut(0.18);
    };
  }, [animation, bodyMixer, bodySource.animations, headAnimations, headMixer]);

  useEffect(() => () => {
    bodyMixer.stopAllAction();
    headMixer.stopAllAction();
  }, [bodyMixer, headMixer]);

  useFrame((_state, delta) => {
    if (reducedMotion) return;
    bodyMixer.update(delta);
    headMixer.update(delta);
  });

  return <group scale={0.048} dispose={null}>
    <primitive object={body} />
    <primitive object={head} />
  </group>;
}

useLoader.preload(GLTFLoader, BODY_MODEL_URL);
HEAD_MODEL_URLS.forEach((url) => useLoader.preload(GLTFLoader, url));
