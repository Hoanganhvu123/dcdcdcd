import React from 'react';
import { FileX } from 'lucide-react';

export default function FileError(props: React.ComponentProps<typeof FileX>) {
  const { className, ...rest } = props;
  return <FileX strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
