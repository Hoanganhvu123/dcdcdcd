import * as React from 'react';
import { cn } from '@/lib/utils';

export type DotMatrixLoaderProps = React.ComponentPropsWithoutRef<'span'> & {
  className?: string;
  label?: string;
};

/**
 * 3x3 dot-matrix loader mark for running work.
 * Dots use currentColor at two opacities so lit/dim contrast holds in both themes.
 */
const FRAMES: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 0, 0, 1, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 0, 1, 0, 1, 1],
  [0, 0, 1, 0, 1, 1, 1, 1, 0],
  [1, 1, 0, 0, 1, 0, 1, 0, 1],
];

export function DotMatrixLoader({ className, label = 'Loading...', ...rest }: DotMatrixLoaderProps) {
  const [frame, setFrame] = React.useState(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  React.useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, 180);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const pattern = FRAMES[frame] ?? FRAMES[0];

  return (
    <span
      {...rest}
      role="status"
      aria-label={label}
      title={label}
      data-slot="dot-matrix-loader"
      className={cn('inline-grid size-3.5 shrink-0 grid-cols-3 grid-rows-3 gap-px', className)}
    >
      {pattern.map((lit, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('size-full rounded-full bg-current', lit ? 'opacity-90' : 'opacity-25')}
        />
      ))}
    </span>
  );
}
