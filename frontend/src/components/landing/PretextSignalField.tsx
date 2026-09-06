import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import { useEffect, useRef } from 'react';

interface Glyph {
  char: string;
  font: string;
  x: number;
  y: number;
  progress: number;
  color: string;
}

/** Pretext maps intact characters and wrapped lines into two coordinated scan effects. */
export function PretextSignalField({ text, variant = 'title' }: {
  text: string | readonly [string, string];
  variant?: 'title' | 'subtitle';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const title = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !title || !context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const inset = 8;
    let glyphs: Glyph[] = [];
    let scanLines: { left: number; right: number; y: number; delay: number }[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let disposed = false;
    let visible = false;
    let ready = false;
    let lastTime = 0;
    let lastDraw = 0;
    let elapsed = variant === 'subtitle' ? 1400 : 800;

    const restore = () => {
      title.removeAttribute('data-pretext-active');
      context.clearRect(0, 0, width, height);
    };
    const layout = () => {
      restore();
      width = title.clientWidth + inset * 2;
      height = title.clientHeight + inset * 2;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      glyphs = [];
      scanLines = [];
      const sources = title.querySelectorAll<HTMLElement>('[data-pretext-source]');
      const blocks = typeof text === 'string' ? [text] : text;
      sources.forEach((source, row) => {
        const style = getComputedStyle(source);
        const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const letterSpacing = parseFloat(style.letterSpacing) || 0;
        const lineHeight = parseFloat(style.lineHeight);
        const prepared = prepareWithSegments(blocks[row], font, { letterSpacing, whiteSpace: 'pre-wrap' });
        const { lines } = layoutWithLines(prepared, source.clientWidth, lineHeight);
        context.font = font;
        context.letterSpacing = `${letterSpacing}px`;
        const metrics = context.measureText(blocks[row]);
        const baseline = (lineHeight + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
        lines.forEach((line, lineIndex) => {
          const lineWidth = context.measureText(line.text).width;
          const origin = inset + source.offsetLeft + (style.textAlign === 'center' ? (source.clientWidth - lineWidth) / 2 : 0);
          scanLines.push({ left: origin, right: origin + lineWidth,
            y: inset + source.offsetTop + lineIndex * lineHeight + baseline + 6,
            delay: lineIndex * .22 + row * .1 });
          let prefix = '';
          Array.from(line.text).forEach((char, index) => {
            prefix += char;
            const x = origin + context.measureText(prefix).width - context.measureText(char).width;
            if (!char.trim()) return;
            glyphs.push({ char, font, x,
              y: inset + source.offsetTop + lineIndex * lineHeight + baseline,
              progress: (x - inset) / Math.max(1, title.clientWidth) + lineIndex * .22 + row * .1,
              color: variant === 'subtitle' ? '#eaf1ec' : row ? `hsl(${180 - index / Math.max(1, line.text.length - 1) * 65} 72% 75%)` : '#f4f9f7',
            });
          });
        });
      });
      canvas.dataset.glyphs = String(glyphs.length);
      canvas.dataset.ready = String(glyphs.length > 0);
    };

    const draw = (now: number) => {
      frame = 0;
      if (disposed || !ready) return;
      if (motion.matches) {
        restore();
        canvas.dataset.phase = 'static';
        return;
      }
      if (!visible || document.hidden) return;
      // Keep the rhythm stable even when the background scene drops frames.
      elapsed += lastTime ? now - lastTime : 0;
      lastTime = now;
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 32) return;
      lastDraw = now;
      const duration = variant === 'subtitle' ? 6500 : 5000;
      const sweep = (elapsed % duration) / duration * (1.7 + (scanLines[scanLines.length - 1]?.delay ?? 0)) - .35;
      canvas.dataset.phase = 'flow';
      canvas.dataset.cycle = String(Math.floor(elapsed / duration));
      context.clearRect(0, 0, width, height);
      title.dataset.pretextActive = 'true';
      context.textBaseline = 'alphabetic';
      context.textAlign = 'left';
      context.letterSpacing = '0px';
      for (const glyph of glyphs) {
        const distance = Math.abs(glyph.progress - sweep) / .28;
        const wave = distance < 1 ? (1 + Math.cos(distance * Math.PI)) / 2 : 0;
        const subtitle = variant === 'subtitle';
        const y = glyph.y - wave * (subtitle ? 3 : 7);
        context.font = glyph.font;
        // A narrow spectral edge gives the title a glass-like refraction at the crest.
        if (!subtitle && wave > .1) {
          context.globalAlpha = wave * .32;
          context.shadowColor = '#7aece6';
          context.shadowBlur = wave * 8;
          context.fillStyle = '#57e7fa';
          context.fillText(glyph.char, glyph.x - wave * 1.8, y + 1);
          context.fillStyle = '#b5ffd4';
          context.fillText(glyph.char, glyph.x + wave * 1.8, y - 1);
        }
        context.fillStyle = subtitle
          ? `rgb(${Math.round(234 - wave * 48)}, ${Math.round(241 + wave * 14)}, ${Math.round(236 + wave * 3)})`
          : glyph.color;
        context.globalAlpha = subtitle ? .54 + wave * .46 : .9 + wave * .1;
        context.shadowColor = '#7aece6';
        context.shadowBlur = subtitle && wave > .1 ? wave * 2 : 0;
        context.fillText(glyph.char, glyph.x, y);
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      if (variant === 'subtitle') {
        for (const line of scanLines) {
          const scanner = inset + (sweep - line.delay) * title.clientWidth;
          const left = Math.max(line.left, scanner - 46);
          const right = Math.min(line.right, scanner + 8);
          if (right <= left) continue;
          const glow = context.createLinearGradient(scanner - 46, 0, scanner + 8, 0);
          glow.addColorStop(0, '#8ff4fb00');
          glow.addColorStop(.8, '#8ff4fba8');
          glow.addColorStop(1, '#8ff4fb00');
          context.fillStyle = glow;
          context.fillRect(left, line.y, right - left, 1);
        }
      }
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (motion.matches) {
        restore();
        canvas.dataset.phase = 'static';
      }
      if (ready && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(title);
    const resize = new ResizeObserver(() => { if (ready) { layout(); sync(); } });
    resize.observe(title);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    void document.fonts.ready.then(() => {
      if (disposed) return;
      layout();
      ready = glyphs.length > 0;
      sync();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      restore();
    };
  }, [text, variant]);
  return <canvas ref={ref} className={`contract-pretext-text contract-pretext-${variant}`} aria-hidden="true" />;
}
