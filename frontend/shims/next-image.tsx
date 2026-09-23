/**
 * `next/image` as a plain `<img>`.
 *
 * The Next config already ran with `images: { unoptimized: true }`, so the
 * component was rendering an unoptimized `<img>` anyway — this changes nothing
 * at runtime. `placeholder` is dropped because it is a Next-only prop and React
 * would warn about it on a DOM element.
 */
import type { ImgHTMLAttributes } from 'react';

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> & {
  placeholder?: string;
  priority?: boolean;
  quality?: number;
  fill?: boolean;
  unoptimized?: boolean;
};

export default function Image({ placeholder, priority, quality, fill, unoptimized, style, ...props }: NextImageProps) {
  return <img {...props} style={fill ? { ...style, position: 'absolute', inset: 0, width: '100%', height: '100%' } : style} />;
}
