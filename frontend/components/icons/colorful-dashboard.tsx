import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export default function ColorfulDashboard(props: React.ComponentProps<typeof LayoutDashboard>) {
  const { className, ...rest } = props;
  return <LayoutDashboard strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
