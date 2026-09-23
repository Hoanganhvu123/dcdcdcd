import React from 'react';
import { BookMarked } from 'lucide-react';

export default function Knowledge(props: React.ComponentProps<typeof BookMarked>) {
  const { className, ...rest } = props;
  return <BookMarked strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
