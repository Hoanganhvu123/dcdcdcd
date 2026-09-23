import React from 'react';
import { Cpu } from 'lucide-react';

export default function ModelSvg(props: React.ComponentProps<typeof Cpu>) {
  const { className, ...rest } = props;
  return <Cpu strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
