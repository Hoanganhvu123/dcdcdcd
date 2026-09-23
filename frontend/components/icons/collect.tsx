import React from 'react';
import { Bookmark } from 'lucide-react';

export default function Collect(props: React.ComponentProps<typeof Bookmark>) {
  const { className, ...rest } = props;
  return <Bookmark strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
