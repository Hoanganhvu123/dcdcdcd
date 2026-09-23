import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function DoneIcon(props: React.ComponentProps<typeof CheckCircle2>) {
  const { className, ...rest } = props;
  return <CheckCircle2 strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
