import React from 'react';
import { Clock } from 'lucide-react';

export default function PendingIcon(props: React.ComponentProps<typeof Clock>) {
  const { className, ...rest } = props;
  return <Clock strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
