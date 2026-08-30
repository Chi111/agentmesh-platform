import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { useEffect, useRef, type RefObject } from 'react';

interface BabylonHeroSceneProps {
  heroRef: RefObject<HTMLElement | null>;
}

interface NeonFrameSource {
  topBottom: ReturnType<typeof CreateBox>;
  sides: ReturnType<typeof CreateBox>;
  topBottomMatrices: Float32Array;
  sideMatrices: Float32Array;
}

const REFERENCE_URL = 'https://mesh3d.gallery/experiment/scifi-tunnel';

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(start: number, end: number, value: number) {
  const normalized = clamp((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

function easeOutExpo(value: number) {
  return value >= 1 ? 1 : 1 - 2 ** (-10 * value);
}

function pathPoint(distance: number) {
  return new Vector3(
    Math.sin(distance * 0.29) * 0.74 + Math.sin(distance * 0.105) * 0.34,
    Math.cos(distance * 0.255) * 0.5 + Math.sin(distance * 0.12) * 0.24,
    distance,
  );
}

function pathTangent(distance: number) {
  return pathPoint(distance + 0.035).subtract(pathPoint(distance - 0.035)).normalize();
}

export function BabylonHeroScene({ heroRef }: BabylonHeroSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    let engine: Engine | null = null;
    let scene: Scene | null = null;
    let heroVisible = true;

    const setFullResolution = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      engine?.setHardwareScalingLevel(1 / ratio);
    };

    const start = async () => {
      try {
        engine = new Engine(canvas, true, {
          antialias: true,
          preserveDrawingBuffer: false,
          stencil: true,
          powerPreference: 'high-performance',
        }, true);
        setFullResolution();

        scene = new Scene(engine);
        scene.clearColor = new Color4(0, 0, 0, 0);
        scene.imageProcessingConfiguration.exposure = 0.92;
        scene.imageProcessingConfiguration.contrast = 1.18;

        const camera = new FreeCamera('mesh3d-scifi-camera', new Vector3(0, 0, -2.65), scene);
        camera.fov = 0.92;
        camera.minZ = 0.06;
        camera.maxZ = 80;
        camera.inputs.clear();

        const tunnelRoot = new TransformNode('mesh3d-scifi-tunnel-root', scene);
        const palette = ['#2458ff', '#00c8ff', '#a7ed3f', '#ffd43f', '#ff6518', '#ff1394', '#8154ff'];
        const ringCount = 18;
        const panelsPerRing = 13;
        const ringSpacing = 1.34;
        const tunnelDepth = ringCount * ringSpacing;
        const ringRadius = 2.68;
        const frameWidth = 0.93;
        const frameHeight = 0.62;
        const frameDepth = 0.115;
        const barThickness = 0.085;
        const framesPerColor = Math.ceil(ringCount / palette.length) * panelsPerRing;
        const matricesPerBar = framesPerColor * 2;

        const sources: NeonFrameSource[] = palette.map((hex, colorIndex) => {
          const material = new StandardMaterial(`neon-frame-material-${colorIndex}`, scene!);
          const color = Color3.FromHexString(hex);
          material.diffuseColor = color.scale(0.03);
          material.emissiveColor = color.scale(0.8);
          material.specularColor = Color3.Black();
          material.alpha = 0.86;
          material.disableLighting = true;
          material.backFaceCulling = false;

          const topBottom = CreateBox(`neon-frame-horizontal-${colorIndex}`, { size: 1 }, scene!);
          topBottom.material = material;
          topBottom.parent = tunnelRoot;
          topBottom.isPickable = false;
          topBottom.alwaysSelectAsActiveMesh = true;

          const sides = CreateBox(`neon-frame-vertical-${colorIndex}`, { size: 1 }, scene!);
          sides.material = material;
          sides.parent = tunnelRoot;
          sides.isPickable = false;
          sides.alwaysSelectAsActiveMesh = true;

          const topBottomMatrices = new Float32Array(matricesPerBar * 16);
          const sideMatrices = new Float32Array(matricesPerBar * 16);
          topBottom.thinInstanceSetBuffer('matrix', topBottomMatrices, 16, false);
          sides.thinInstanceSetBuffer('matrix', sideMatrices, 16, false);
          return { topBottom, sides, topBottomMatrices, sideMatrices };
        });

        const temporaryOffset = Vector3.Zero();
        const temporaryWorldOffset = Vector3.Zero();
        const rotationMatrix = Matrix.Identity();
        const rotation = Quaternion.Identity();
        const topBottomScale = new Vector3(frameWidth, barThickness, frameDepth);
        const sideScale = new Vector3(barThickness, frameHeight, frameDepth);

        const updateTunnelMatrices = (flight: number, twist: number) => {
          const counts = palette.map(() => ({ horizontal: 0, vertical: 0 }));

          for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
            const distance = ((ringIndex * ringSpacing - flight + tunnelDepth) % tunnelDepth) + 0.35;
            const center = pathPoint(distance);
            const tangent = pathTangent(distance);
            const normalX = Vector3.Cross(Vector3.Up(), tangent).normalize();
            const normalY = Vector3.Cross(tangent, normalX).normalize();
            const colorIndex = ringIndex % palette.length;
            const source = sources[colorIndex];
            const count = counts[colorIndex];
            const ringTwist = twist + ringIndex * 0.045 + Math.sin(ringIndex * 0.73) * 0.025;

            for (let panelIndex = 0; panelIndex < panelsPerRing; panelIndex += 1) {
              const angle = (panelIndex / panelsPerRing) * Math.PI * 2 + ringTwist;
              const radial = normalX.scale(Math.cos(angle)).add(normalY.scale(Math.sin(angle))).normalize();
              const circumferential = normalX.scale(-Math.sin(angle)).add(normalY.scale(Math.cos(angle))).normalize();
              const frameCenter = center.add(radial.scale(ringRadius));

              // Each hollow panel lives in the ring plane: its long edge follows the
              // circumference and its short edge points away from the tunnel axis.
              Matrix.FromXYZAxesToRef(circumferential, radial, tangent.scale(-1), rotationMatrix);
              Quaternion.FromRotationMatrixToRef(rotationMatrix, rotation);

              for (const direction of [-1, 1]) {
                temporaryOffset.copyFromFloats(0, direction * frameHeight * 0.5, 0);
                temporaryOffset.rotateByQuaternionToRef(rotation, temporaryWorldOffset);
                Matrix.Compose(
                  topBottomScale,
                  rotation,
                  frameCenter.add(temporaryWorldOffset),
                ).copyToArray(source.topBottomMatrices, count.horizontal * 16);
                count.horizontal += 1;

                temporaryOffset.copyFromFloats(direction * frameWidth * 0.5, 0, 0);
                temporaryOffset.rotateByQuaternionToRef(rotation, temporaryWorldOffset);
                Matrix.Compose(
                  sideScale,
                  rotation,
                  frameCenter.add(temporaryWorldOffset),
                ).copyToArray(source.sideMatrices, count.vertical * 16);
                count.vertical += 1;
              }
            }
          }

          sources.forEach((source) => {
            source.topBottom.thinInstanceBufferUpdated('matrix');
            source.sides.thinInstanceBufferUpdated('matrix');
          });
        };

        updateTunnelMatrices(0, 0);
        sources.forEach((source) => {
          source.topBottom.thinInstanceRefreshBoundingInfo(true);
          source.sides.thinInstanceRefreshBoundingInfo(true);
        });

        const glow = new GlowLayer('mesh3d-scifi-glow', scene, { blurKernelSize: 64 });
        glow.intensity = 0.82;

        container.dataset.ready = 'true';
        container.dataset.source = REFERENCE_URL;
        container.dataset.effects = 'curved-flight neon-frames camera-roll heavy-bloom';
        container.dataset.geometry = 'mesh3d-scifi-hollow-frame-tunnel';
        container.dataset.frames = String(ringCount * panelsPerRing);
        container.dataset.quality = 'full';

        const startedAt = performance.now();
        let pointerX = 0;
        let pointerY = 0;
        let targetPointerX = 0;
        let targetPointerY = 0;
        let lastPerformanceCheck = startedAt;
        let renderSamples: number[] = [];

        const handlePointer = (event: PointerEvent) => {
          if (window.innerWidth < 900 || reducedMotion) return;
          targetPointerX = (event.clientX / window.innerWidth - 0.5) * 2;
          targetPointerY = (event.clientY / window.innerHeight - 0.5) * 2;
        };
        window.addEventListener('pointermove', handlePointer, { passive: true });

        const resize = () => {
          setFullResolution();
          engine?.resize();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        window.addEventListener('resize', resize);

        const intersectionObserver = new IntersectionObserver(([entry]) => {
          heroVisible = entry?.isIntersecting ?? true;
          if (reducedMotion && heroVisible) scene?.render();
        }, { rootMargin: '20% 0px' });
        intersectionObserver.observe(container);

        const render = () => {
          if (!scene || !heroVisible || document.hidden) return;
          const now = performance.now();
          const elapsed = now - startedAt;
          const intro = reducedMotion ? 1 : easeOutExpo(clamp((elapsed - 80) / 1_250));
          const hero = heroRef.current;
          const progress = Number(hero?.style.getPropertyValue('--hero-scene-progress') || 0);
          const morph = Number(hero?.style.getPropertyValue('--hero-scene-morph') || 0);
          const travel = smoothstep(0.02, 0.96, morph);
          const warpCharge = Math.sin(Math.PI * clamp(travel));
          const wide = window.innerWidth >= 1024;

          pointerX += (targetPointerX - pointerX) * 0.055;
          pointerY += (targetPointerY - pointerY) * 0.055;

          const initialX = 0;
          const initialY = wide ? 0 : window.innerWidth < 640 ? -2.05 : -1.32;
          const baseScale = wide ? 1 : window.innerWidth < 640 ? 0.67 : 0.8;
          const introScale = 0.2 + intro * 0.8;
          tunnelRoot.position.x = initialX * (1 - smoothstep(0.02, 0.44, travel));
          tunnelRoot.position.y = initialY * (1 - smoothstep(0.08, 0.58, travel));
          tunnelRoot.scaling.setAll(baseScale * introScale * (1 + travel * (wide ? 0.2 : 0.12)));

          const flight = reducedMotion ? 0 : (elapsed * (0.00155 + travel * 0.0052)) % tunnelDepth;
          const twist = reducedMotion ? 0.16 : elapsed * 0.00048 + travel * 0.45;
          updateTunnelMatrices(flight, twist);

          const cameraStart = pathPoint(-2.65);
          const cameraTarget = pathPoint(4.5 + travel * 4.2);
          camera.position.copyFrom(cameraStart);
          camera.position.x += pointerX * 0.1;
          camera.position.y -= pointerY * 0.075;
          camera.setTarget(cameraTarget);
          camera.rotation.z += elapsed * 0.00036 + travel * 0.16;
          camera.fov = 0.92 - travel * 0.08;

          glow.intensity = 0.82 + warpCharge * 0.22;
          scene.imageProcessingConfiguration.exposure = 0.92 + warpCharge * 0.06;
          const transitionReveal = smoothstep(0.14, 0.34, progress)
            * (1 - smoothstep(0.42, 0.62, progress));
          const chapterDimming = smoothstep(0.42, 0.66, progress);
          const transitionOpacity = 0.24 + transitionReveal * 0.66;
          const sceneOpacity = transitionOpacity * (1 - chapterDimming) + 0.08 * chapterDimming;
          container.style.setProperty('--babylon-scene-opacity', sceneOpacity.toFixed(3));
          container.dataset.sceneOpacity = sceneOpacity.toFixed(3);

          const renderStartedAt = performance.now();
          scene.render();
          renderSamples.push(performance.now() - renderStartedAt);
          if (now - lastPerformanceCheck >= 2_000) {
            const averageRenderMs = renderSamples.reduce((sum, sample) => sum + sample, 0) / Math.max(1, renderSamples.length);
            container.dataset.renderMs = averageRenderMs.toFixed(2);
            renderSamples = [];
            lastPerformanceCheck = now;
          }
        };

        if (reducedMotion) {
          render();
        } else {
          engine.runRenderLoop(render);
        }

        const cleanup = () => {
          window.removeEventListener('pointermove', handlePointer);
          window.removeEventListener('resize', resize);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
        };
        scene.onDisposeObservable.addOnce(cleanup);
      } catch (error) {
        if (!cancelled) {
          container.dataset.failed = 'true';
          container.dataset.error = error instanceof Error ? error.message : String(error);
          console.warn('Babylon Mesh3D tunnel unavailable; using the CSS fallback.', error);
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      engine?.stopRenderLoop();
      scene?.dispose();
      engine?.dispose();
    };
  }, [heroRef]);

  return (
    <div ref={containerRef} className="contract-babylon" aria-hidden="true">
      <canvas ref={canvasRef} className="contract-babylon__canvas" />
      <div className="contract-babylon__flare" />
      <div className="contract-babylon__vignette" />
    </div>
  );
}
