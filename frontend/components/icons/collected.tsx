import React from 'react';
import { BookmarkCheck } from 'lucide-react';

export default function Collected(props: React.ComponentProps<typeof BookmarkCheck>) {
  const { className, ...rest } = props;
  return <BookmarkCheck strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
