import React from 'react';
import { Plus } from 'lucide-react';

export default function AddIcon(props: React.ComponentProps<typeof Plus>) {
  const { className, ...rest } = props;
  return <Plus strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
