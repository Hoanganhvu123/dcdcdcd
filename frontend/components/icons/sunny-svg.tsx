import React from 'react';
import { Sun } from 'lucide-react';

export default function SunnySvg(props: React.ComponentProps<typeof Sun>) {
  const { className, ...rest } = props;
  return <Sun strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
