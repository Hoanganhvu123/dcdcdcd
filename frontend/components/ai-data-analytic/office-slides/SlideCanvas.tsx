import React, { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface SlideCanvasProps {
  children?: ReactNode;
  /** If set, use this scale directly. Otherwise fit to container dynamically. */
  scale?: number;
  /** Flat mode disables card border, shadow and rounded corners */
  flat?: boolean;
  /** Centers the canvas inside the container */
  center?: boolean;
  /** Optional class for outer wrapper */
  className?: string;
  /** Optional class for inner 1920x1080 canvas element */
  canvasClassName?: string;
  /** Injected CSS variables */
  themeVars?: Record<string, string>;
  /** If true, places an overlay preventing interaction/pointer-events */
  freezeMotion?: boolean;
}

/**
 * 1920x1080 Scale-to-Fit Slide Canvas Engine.
 * Synchronously computes scale on first frame before paint to avoid visual flash,
 * and attaches a ResizeObserver to dynamically adapt to window/container resizes.
 */
export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  children,
  scale,
  flat = false,
  center = true,
  className = '',
  canvasClassName = '',
  themeVars,
  freezeMotion = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (scale !== undefined) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const computedScale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
      setFitScale(computedScale);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => ro.disconnect();
  }, [scale]);

  const s = scale ?? fitScale ?? 1;
  const scaledW = CANVAS_WIDTH * s;
  const scaledH = CANVAS_HEIGHT * s;
  const isPendingMeasurement = scale === undefined && fitScale === null;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden select-none ${className}`}
      data-testid="slide-canvas-container"
    >
      <div
        className={`overflow-hidden transition-opacity duration-150 ${
          !flat ? 'rounded-xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10' : ''
        }`}
        style={
          {
            width: scaledW,
            height: scaledH,
            visibility: isPendingMeasurement ? 'hidden' : undefined,
            opacity: isPendingMeasurement ? 0 : 1,
            ...(center
              ? {
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }
              : {}),
            ...(themeVars || {}),
          } as CSSProperties
        }
      >
        <div
          data-testid="slide-canvas-stage"
          className={`relative overflow-hidden ${canvasClassName}`}
          style={
            {
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${s})`,
              transformOrigin: 'top left',
              ...(themeVars || {}),
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>

      {freezeMotion && <div aria-hidden className="absolute inset-0 z-20 pointer-events-auto" />}
    </div>
  );
};

export default SlideCanvas;
