import { useEffect, type RefObject } from 'react';

/** Keep pointer effects local to the landing page and out of React's render loop. */
export function useLandingInteractions(rootRef: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const enabled = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const surfaces = Array.from(root.querySelectorAll<HTMLElement>('[data-magnetic], [data-holographic]'));
    const cleanups = surfaces.map((surface) => {
      let frame = 0;
      let bounds: DOMRect | null = null;
      const reset = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        bounds = null;
        for (const property of ['--surface-x', '--surface-y', '--light-x', '--light-y', '--tilt-x', '--tilt-y']) {
          surface.style.removeProperty(property);
        }
        surface.removeAttribute('data-pointer-active');
      };
      const move = (event: PointerEvent) => {
        if (!enabled.matches || event.pointerType === 'touch') return;
        // Capture the resting box once to avoid feedback from the surface's own transform.
        bounds ??= surface.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          surface.dataset.pointerActive = 'true';
          surface.style.setProperty('--surface-x', `${x * 7}px`);
          surface.style.setProperty('--surface-y', `${y * 5}px`);
          surface.style.setProperty('--light-x', `${(x + 1) * 50}%`);
          surface.style.setProperty('--light-y', `${(y + 1) * 50}%`);
          surface.style.setProperty('--tilt-x', `${-y * 4}deg`);
          surface.style.setProperty('--tilt-y', `${x * 4}deg`);
        });
      };
      surface.addEventListener('pointermove', move, { passive: true });
      surface.addEventListener('pointerleave', reset);
      surface.addEventListener('pointercancel', reset);
      enabled.addEventListener('change', reset);
      window.addEventListener('scroll', reset, { passive: true });
      window.addEventListener('resize', reset);
      return () => {
        reset();
        surface.removeEventListener('pointermove', move);
        surface.removeEventListener('pointerleave', reset);
        surface.removeEventListener('pointercancel', reset);
        enabled.removeEventListener('change', reset);
        window.removeEventListener('scroll', reset);
        window.removeEventListener('resize', reset);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [rootRef]);
}
