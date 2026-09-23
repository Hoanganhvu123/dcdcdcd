import * as React from 'react';
import { X } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { cn } from '@/lib/utils';

export type PanelTabListProps<Value> = {
  className?: string;
  children?: React.ReactNode;
  onReorder: (newOrder: Value[]) => void;
  values: Value[];
  [key: string]: any;
};

export function PanelTabList<Value>({
  className,
  values,
  onReorder,
  children,
  ...props
}: PanelTabListProps<Value>) {
  return (
    <Reorder.Group
      as="div"
      axis="x"
      values={values}
      onReorder={onReorder}
      className={cn('flex min-w-max items-center gap-1.5', className)}
      {...props}
    >
      {children}
    </Reorder.Group>
  );
}

export function PanelTabItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Reorder.Item>) {
  return (
    <Reorder.Item
      as="div"
      layout="position"
      dragElastic={0}
      whileDrag={{ scale: 1.02, zIndex: 20 }}
      className={cn('group relative max-w-[168px] shrink-0 select-none cursor-grab active:cursor-grabbing', className)}
      {...props}
    >
      {children}
    </Reorder.Item>
  );
}

export type PanelTabProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function PanelTab({ active, className, children, ...props }: PanelTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'w-full min-w-0 flex items-center justify-start gap-2 px-2.5 py-1.5 pr-8 rounded-lg text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground transition-all truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-muted/90 text-foreground font-medium shadow-sm ring-1 ring-border/60',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type PanelTabCloseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'title'
> & {
  active?: boolean;
  label: string;
  onClose: () => void;
};

export function PanelTabClose({
  active,
  className,
  label,
  onClick,
  onClose,
  onPointerDown,
  ...props
}: PanelTabCloseProps) {
  return (
    <button
      type="button"
      className={cn(
        'absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'text-foreground hover:bg-accent hover:text-foreground',
        className
      )}
      title={`Đóng tab: ${label}`}
      aria-label={`Đóng tab: ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);

        if (!event.defaultPrevented) {
          onClose();
        }
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      {...props}
    >
      <X size={12} />
    </button>
  );
}

export default {
  PanelTabList,
  PanelTabItem,
  PanelTab,
  PanelTabClose,
};
