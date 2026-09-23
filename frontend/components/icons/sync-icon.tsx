import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function SyncIcon(props: React.ComponentProps<typeof RefreshCw>) {
  const { className, ...rest } = props;
  return <RefreshCw strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
