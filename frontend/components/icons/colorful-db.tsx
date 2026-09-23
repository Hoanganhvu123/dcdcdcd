import React from 'react';
import { Database } from 'lucide-react';

export default function ColorfulDB(props: React.ComponentProps<typeof Database>) {
  const { className, ...rest } = props;
  return <Database strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
