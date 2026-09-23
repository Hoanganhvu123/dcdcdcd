import React from 'react';
import { Columns } from 'lucide-react';

export default function FieldIcon(props: React.ComponentProps<typeof Columns>) {
  const { className, ...rest } = props;
  return <Columns strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
