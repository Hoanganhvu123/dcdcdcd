import React from 'react';
import { Sparkles } from 'lucide-react';

export default function StarsSvg(props: React.ComponentProps<typeof Sparkles>) {
  const { className, ...rest } = props;
  return <Sparkles strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
