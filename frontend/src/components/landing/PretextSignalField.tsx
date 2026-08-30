import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import { useEffect, useRef, type RefObject } from 'react';

interface PretextSignalFieldProps {
  heroRef: RefObject<HTMLElement | null>;
  titleLines: readonly [string, string];
  description: string;
}

type GlyphTone = 'headline-primary' | 'headline-accent' | 'body';

interface SignalGlyph {
  char: string;
  font: string;
  homeX: number;
  homeY: number;
  startX: number;
  startY: number;
  phase: number;
  colorMix: number;
  hero: boolean;
  tone: GlyphTone;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(start: number, end: number, value: number) {
  const normalized = clamp((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

function seededRandom(seed = 0x7f4a7c15) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function easeOutExpo(value: number) {
  return value >= 1 ? 1 : 1 - 2 ** (-10 * value);
}

export function PretextSignalField({ heroRef, titleLines: heroTitleLines, description: heroDescription }: PretextSignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !container || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    const constrainedDevice = (navigator.hardwareConcurrency || 8) <= 4
      || (navigatorWithMemory.deviceMemory ?? 8) <= 4;
    const random = seededRandom();
    let width = 0;
    let height = 0;
    let glyphs: SignalGlyph[] = [];
    let animationFrame = 0;
    let visible = true;
    let disposed = false;
    let pointerX = -10_000;
    let pointerY = -10_000;
    let lastFrameAt = 0;
    let lastDrawAt = 0;
    let frameSamples: number[] = [];
    let renderSamples: number[] = [];
    let adaptiveLow = constrainedDevice;
    let layoutScrollY = window.scrollY;
    let textBounds = { left: 0, top: 0, right: 0, bottom: 0 };

    const layoutGlyphs = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const mobile = width < 700;
      const pixelRatioCap = adaptiveLow || mobile ? 1 : 1.25;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.textBaseline = 'middle';

      const nextGlyphs: SignalGlyph[] = [];
      const rootRect = container.getBoundingClientRect();
      const addBlock = (
        text: string,
        font: string,
        maxWidth: number,
        lineHeight: number,
        originX: number,
        originY: number,
        letterSpacing: number,
        hero: boolean,
        tone: GlyphTone,
        align: 'left' | 'center',
      ) => {
        const prepared = prepareWithSegments(text, font, {
          letterSpacing,
          whiteSpace: 'pre-wrap',
        });
        const { lines } = layoutWithLines(prepared, maxWidth, lineHeight);
        context.font = font;
        lines.forEach((line, lineIndex) => {
          let cursorX = align === 'center' ? originX + (maxWidth - line.width) / 2 : originX;
          const lineY = originY + lineIndex * lineHeight;
          for (const char of Array.from(line.text)) {
            const charWidth = context.measureText(char).width + letterSpacing;
            if (char.trim()) {
              const homeX = cursorX + charWidth / 2;
              const homeY = lineY;
              const angle = random() * Math.PI * 2;
              const scatter = (hero ? 180 : 80) + random() * (hero ? 260 : 160);
              nextGlyphs.push({
                char,
                font,
                homeX,
                homeY,
                startX: homeX + Math.cos(angle) * scatter,
                startY: homeY + Math.sin(angle) * scatter,
                phase: random() * Math.PI * 2,
                colorMix: clamp((homeX - originX) / Math.max(1, maxWidth)),
                hero,
                tone,
              });
            }
            cursorX += charWidth;
          }
        });
      };

      const title = heroRef.current?.querySelector<HTMLElement>('.contract-hero__headline-source');
      const titleLines = title?.querySelectorAll<HTMLElement>('.contract-hero__line');
      const description = heroRef.current?.querySelector<HTMLElement>('.contract-hero__description-source');

      if (title && titleLines?.length === heroTitleLines.length && description) {
        const titleStyle = window.getComputedStyle(title);
        const titleFont = `${titleStyle.fontWeight} ${titleStyle.fontSize} ${titleStyle.fontFamily}`;
        const titleLetterSpacing = Number.parseFloat(titleStyle.letterSpacing) || 0;
        const titleAlign = titleStyle.textAlign === 'center' ? 'center' : 'left';
        const measuredTitleLines = Array.from(titleLines).map((line) => line.getBoundingClientRect());

        measuredTitleLines.forEach((lineRect, index) => {
          addBlock(
            heroTitleLines[index],
            titleFont,
            lineRect.width,
            Number.parseFloat(titleStyle.lineHeight) || lineRect.height,
            lineRect.left - rootRect.left,
            lineRect.top - rootRect.top + lineRect.height / 2,
            titleLetterSpacing,
            true,
            index === 0 ? 'headline-primary' : 'headline-accent',
            titleAlign,
          );
        });

        const descriptionRect = description.getBoundingClientRect();
        const descriptionStyle = window.getComputedStyle(description);
        const descriptionLineHeight = Number.parseFloat(descriptionStyle.lineHeight)
          || Number.parseFloat(descriptionStyle.fontSize) * 1.7;
        addBlock(
          heroDescription,
          `${descriptionStyle.fontWeight} ${descriptionStyle.fontSize} ${descriptionStyle.fontFamily}`,
          descriptionRect.width,
          descriptionLineHeight,
          descriptionRect.left - rootRect.left,
          descriptionRect.top - rootRect.top + descriptionLineHeight / 2,
          Number.parseFloat(descriptionStyle.letterSpacing) || 0,
          false,
          'body',
          descriptionStyle.textAlign === 'center' ? 'center' : 'left',
        );

        textBounds = {
          left: Math.min(...measuredTitleLines.map((line) => line.left), descriptionRect.left) - rootRect.left,
          top: Math.min(...measuredTitleLines.map((line) => line.top)) - rootRect.top,
          right: Math.max(...measuredTitleLines.map((line) => line.right), descriptionRect.right) - rootRect.left,
          bottom: descriptionRect.bottom - rootRect.top,
        };
      }

      glyphs = nextGlyphs;
      layoutScrollY = window.scrollY;
      container.dataset.quality = adaptiveLow ? 'economy' : 'high';
      container.dataset.glyphs = String(glyphs.length);
      container.dataset.ready = 'true';
    };

    const resize = () => layoutGlyphs();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const handlePointerMove = (event: PointerEvent) => {
      if (width < 900 || reducedMotion || adaptiveLow) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const handlePointerLeave = () => {
      pointerX = -10_000;
      pointerY = -10_000;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    }, { rootMargin: '15% 0px' });
    intersectionObserver.observe(container);

    const startedAt = performance.now();
    const draw = (now: number) => {
      if (disposed) return;
      animationFrame = window.requestAnimationFrame(draw);
      if (!visible || document.hidden || !glyphs.length) {
        lastFrameAt = now;
        return;
      }

      const frameDelta = lastFrameAt ? now - lastFrameAt : 16.7;
      lastFrameAt = now;
      if (frameDelta < 120) frameSamples.push(frameDelta);
      const mobile = width < 700;
      const targetFrameMs = adaptiveLow ? 50 : mobile ? 41 : 33;
      if (!reducedMotion && now - lastDrawAt < targetFrameMs) return;
      lastDrawAt = now;

      const renderStartedAt = performance.now();
      context.clearRect(0, 0, width, height);
      const elapsed = now - startedAt;
      const progress = Number(heroRef.current?.style.getPropertyValue('--hero-scene-progress') || 0);
      if (progress < 0.04 && Math.abs(window.scrollY - layoutScrollY) > 4) layoutGlyphs();
      const scrollFade = 1 - smoothstep(0.18, 0.36, progress);
      container.dataset.scrollFade = scrollFade.toFixed(3);
      const scannerX = ((elapsed * 0.15) % (width + 440)) - 220;
      const pointerRadius = adaptiveLow ? 0 : 180;

      if (!reducedMotion && scannerX > textBounds.left - 60 && scannerX < textBounds.right + 60) {
        const scanGradient = context.createLinearGradient(scannerX - 44, 0, scannerX + 44, 0);
        scanGradient.addColorStop(0, 'rgba(98, 237, 247, 0)');
        scanGradient.addColorStop(0.5, `rgba(98, 237, 247, ${0.055 * scrollFade})`);
        scanGradient.addColorStop(1, 'rgba(98, 237, 247, 0)');
        context.fillStyle = scanGradient;
        context.fillRect(scannerX - 44, textBounds.top - 18, 88, textBounds.bottom - textBounds.top + 36);
        context.fillStyle = `rgba(207, 253, 255, ${0.18 * scrollFade})`;
        context.fillRect(scannerX, textBounds.top - 12, 0.7, textBounds.bottom - textBounds.top + 24);
      }

      for (let index = 0; index < glyphs.length; index += 1) {
        const glyph = glyphs[index];
        const introDelay = glyph.hero ? index * 9 : 500 + index * 4;
        const intro = reducedMotion ? 1 : easeOutExpo(clamp((elapsed - introDelay) / (glyph.hero ? 1250 : 900)));
        const dx = glyph.homeX - pointerX;
        const dy = glyph.homeY - pointerY;
        const pointerDistance = Math.hypot(dx, dy);
        const pointerForce = pointerRadius ? smoothstep(pointerRadius, 0, pointerDistance) : 0;
        const scanForce = Math.max(0, 1 - Math.abs(glyph.homeX - scannerX) / 145);
        const assemblyPulse = glyph.hero
          ? Math.max(0, 1 - Math.abs(elapsed - introDelay - 620) / 620)
          : Math.max(0, 1 - Math.abs(elapsed - introDelay - 420) / 420) * 0.2;
        const drift = reducedMotion ? 0 : Math.sin(elapsed * 0.0011 + glyph.phase) * (glyph.hero ? 2.2 : 1.1);
        const safeDistance = Math.max(1, pointerDistance);
        const repelX = (dx / safeDistance) * pointerForce * 22;
        const repelY = (dy / safeDistance) * pointerForce * 18;
        const x = glyph.startX + (glyph.homeX - glyph.startX) * intro + repelX;
        const y = glyph.startY + (glyph.homeY - glyph.startY) * intro + repelY + drift;
        const baseAlpha = glyph.hero ? 0.9 : 0.48;
        const activeAlpha = glyph.hero ? 0.09 : 0.28;
        const alpha = Math.min(0.98, baseAlpha + Math.max(scanForce, pointerForce) * activeAlpha + assemblyPulse * 0.18)
          * intro * scrollFade;
        if (alpha < 0.006) continue;

        context.font = glyph.font;
        context.textAlign = 'center';
        context.shadowBlur = glyph.hero
          ? 12 * Math.max(scanForce, assemblyPulse)
          : 8 * Math.max(scanForce, pointerForce, assemblyPulse);
        const accentRed = Math.round(143 + (183 - 143) * glyph.colorMix);
        const accentGreen = Math.round(244 + (243 - 244) * glyph.colorMix);
        const accentBlue = Math.round(251 + (74 - 251) * glyph.colorMix);
        const isAccent = glyph.tone === 'headline-accent';
        context.shadowColor = isAccent ? '#85e9f7' : '#d8fffc';
        context.fillStyle = glyph.tone === 'headline-primary'
          ? `rgba(244, 249, 247, ${alpha})`
          : isAccent
            ? `rgba(${accentRed}, ${accentGreen}, ${accentBlue}, ${alpha})`
            : `rgba(181, 196, 193, ${alpha})`;
        if (glyph.hero) {
          context.lineWidth = 0.8;
          context.strokeStyle = isAccent
            ? `rgba(171, 250, 242, ${alpha * 0.32})`
            : `rgba(255, 255, 255, ${alpha * 0.42})`;
          context.strokeText(glyph.char, x, y);
        }
        context.fillText(glyph.char, x, y);

        if (!glyph.hero && pointerForce > 0.3 && index > 0 && !adaptiveLow) {
          const previous = glyphs[index - 1];
          context.beginPath();
          context.moveTo(previous.homeX, previous.homeY);
          context.lineTo(x, y);
          context.strokeStyle = `rgba(98, 237, 247, ${pointerForce * 0.16})`;
          context.lineWidth = 0.65;
          context.stroke();
        }
      }
      context.shadowBlur = 0;

      const renderMs = performance.now() - renderStartedAt;
      renderSamples.push(renderMs);
      if (frameSamples.length >= 90) {
        const averageFrameMs = frameSamples.reduce((sum, sample) => sum + sample, 0) / frameSamples.length;
        const averageRenderMs = renderSamples.reduce((sum, sample) => sum + sample, 0) / Math.max(1, renderSamples.length);
        container.dataset.frameMs = averageFrameMs.toFixed(1);
        container.dataset.renderMs = averageRenderMs.toFixed(2);
        if (!adaptiveLow && (averageFrameMs > 25 || averageRenderMs > 5.5)) {
          adaptiveLow = true;
          layoutGlyphs();
        }
        frameSamples = [];
        renderSamples = [];
      }
    };

    const start = async () => {
      await document.fonts.ready;
      if (disposed) return;
      layoutGlyphs();
      draw(startedAt + (reducedMotion ? 2_000 : 16.7));
      if (glyphs.length) heroRef.current?.setAttribute('data-pretext-ready', 'true');
      container.dataset.frameMs = reducedMotion ? '0.0' : '16.7';
      container.dataset.renderMs = (renderSamples[0] ?? 0).toFixed(2);
      if (reducedMotion) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
    void start();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      heroRef.current?.removeAttribute('data-pretext-ready');
    };
  }, [heroDescription, heroRef, heroTitleLines]);

  return (
    <div ref={containerRef} className="contract-pretext" aria-hidden="true">
      <canvas ref={canvasRef} className="contract-pretext__canvas" />
    </div>
  );
}
