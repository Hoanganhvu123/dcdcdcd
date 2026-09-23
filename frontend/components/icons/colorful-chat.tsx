import React from 'react';
import { MessageSquare } from 'lucide-react';

export default function ColorfulChat(props: React.ComponentProps<typeof MessageSquare>) {
  const { className, ...rest } = props;
  return <MessageSquare strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
