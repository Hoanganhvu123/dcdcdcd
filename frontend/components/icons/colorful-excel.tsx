import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

export default function ColorfulExcel(props: React.ComponentProps<typeof FileSpreadsheet>) {
  const { className, ...rest } = props;
  return <FileSpreadsheet strokeWidth={1.5} className={className || 'w-[1.2em] h-[1.2em] inline-block'} {...rest} />;
}
