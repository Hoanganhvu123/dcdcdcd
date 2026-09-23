import React from 'react';
import { FileClock } from 'lucide-react';

export default function FileSync(props: React.ComponentProps<typeof FileClock>) {
  const { className, ...rest } = props;
  return <FileClock strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
