import React from 'react';
import { Moon } from 'lucide-react';

export default function DarkSvg(props: React.ComponentProps<typeof Moon>) {
  const { className, ...rest } = props;
  return <Moon strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
