import React from 'react';
import { Plug } from 'lucide-react';

export default function ColorfulPlugin(props: React.ComponentProps<typeof Plug>) {
  const { className, ...rest } = props;
  return <Plug strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
