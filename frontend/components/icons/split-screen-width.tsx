import React from 'react';
import { Rows } from 'lucide-react';

export default function SplitScreenWidth(props: React.ComponentProps<typeof Rows>) {
  const { className, ...rest } = props;
  return <Rows strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
