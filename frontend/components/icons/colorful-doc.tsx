import React from 'react';
import { FileText } from 'lucide-react';

export default function ColorfulDoc(props: React.ComponentProps<typeof FileText>) {
  const { className, ...rest } = props;
  return <FileText strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
