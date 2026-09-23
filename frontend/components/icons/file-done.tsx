import React from 'react';
import { FileCheck } from 'lucide-react';

export default function FileDone(props: React.ComponentProps<typeof FileCheck>) {
  const { className, ...rest } = props;
  return <FileCheck strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
