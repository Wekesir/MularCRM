import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function useCountUp(target, { duration = 1200, decimals = 0 } = {}) {
  const numericTarget = Number(target) || 0;
  const [value, setValue] = useState(prefersReducedMotion() ? numericTarget : 0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(numericTarget);
      return undefined;
    }

    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setValue(numericTarget * easeOutCubic(progress));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // Re-run only when the target actually changes, not on every render.
  }, [numericTarget, duration]);

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
