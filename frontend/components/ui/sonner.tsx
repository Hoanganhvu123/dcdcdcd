import * as React from 'react';
import { Toaster as Sonner, toast as sonnerToast, type ToasterProps } from 'sonner';
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';

type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
import { cva, type VariantProps } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const toasterStyle: React.CSSProperties & Record<`--${string}`, string> = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius)',
};

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4 text-foreground" strokeWidth={1.5} />,
        info: <Info className="size-4 text-foreground" strokeWidth={1.5} />,
        warning: <AlertTriangle className="size-4 text-muted-foreground" strokeWidth={1.5} />,
        error: <AlertCircle className="size-4 text-foreground" strokeWidth={1.5} />,
        loading: <Loader2 className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />,
      }}
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

type ToastType = 'default' | 'success' | 'info' | 'warning' | 'error';

interface ToastAction {
  label: React.ReactNode;
  onClick: () => void;
}

interface ToastOptions {
  id?: string | number;
  description?: React.ReactNode;
  action?: ToastAction;
  cancel?: ToastAction;
  duration?: number;
}

const TOAST_ICONS: Record<Exclude<ToastType, 'default'>, any> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const toastTile = cva('mt-0.5 flex shrink-0 items-center justify-center', {
  variants: {
    type: {
      default: 'text-foreground',
      success: 'text-foreground',
      info: 'text-foreground',
      warning: 'text-muted-foreground',
      error: 'text-foreground',
    },
    size: {
      default: 'size-8 rounded-xl border',
      sm: 'size-4',
    },
  },
  compoundVariants: [
    { size: 'default', type: 'default', className: 'border-border bg-muted/40' },
    { size: 'default', type: 'success', className: 'border-border bg-muted/40' },
    { size: 'default', type: 'info', className: 'border-border bg-muted/40' },
    { size: 'default', type: 'warning', className: 'border-border bg-muted/40' },
    { size: 'default', type: 'error', className: 'border-border bg-muted/40' },
  ],
  defaultVariants: { type: 'default', size: 'default' },
});

interface ToastIconProps extends VariantProps<typeof toastTile> {
  className?: string;
}

function ToastIcon({ className, type, size }: ToastIconProps) {
  if (!type || type === 'default') {
    return null;
  }

  const Icon = TOAST_ICONS[type];

  return (
    <div className={cn(toastTile({ type, size, className }))}>
      <Icon className="size-4" strokeWidth={1.5} />
    </div>
  );
}

interface ToastCardProps {
  id: string | number;
  type: ToastType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastAction;
  cancel?: ToastAction;
  notification?: boolean;
}

function ToastCard({
  id,
  type,
  title,
  description,
  action,
  cancel,
  notification,
}: ToastCardProps) {
  if (notification) {
    return (
      <div
        className={cn(
          'flex w-full gap-3 rounded-2xl border border-border bg-popover/95 backdrop-blur-sm p-4 text-popover-foreground shadow-md md:max-w-sm ring-1 ring-border/20 items-center'
        )}
      >
        <ToastIcon type={type} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{title}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => sonnerToast.dismiss(id)}
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </Button>
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border border-border bg-popover/95 backdrop-blur-sm p-4 text-popover-foreground shadow-md md:max-w-sm ring-1 ring-border/20'
      )}
    >
      <ToastIcon type={type} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => sonnerToast.dismiss(id)}
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action || cancel ? (
          <div className="mt-2 flex gap-2">
            {action ? (
              <Button
                size="sm"
                onClick={() => {
                  action.onClick();
                  sonnerToast.dismiss(id);
                }}
              >
                {action.label}
              </Button>
            ) : null}
            {cancel ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  cancel.onClick();
                  sonnerToast.dismiss(id);
                }}
              >
                {cancel.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function showToast(
  type: ToastType,
  message: React.ReactNode,
  options?: ToastOptions
) {
  const notification =
    options?.action === undefined && options?.cancel === undefined;

  return sonnerToast.custom(
    (id) => (
      <ToastCard
        id={id}
        type={type}
        title={message}
        description={options?.description}
        action={options?.action}
        cancel={options?.cancel}
        notification={notification}
      />
    ),
    {
      id: options?.id,
      duration: options?.duration,
      position: notification ? 'top-center' : 'bottom-right',
    }
  );
}

const toast = Object.assign(
  (message: React.ReactNode, options?: ToastOptions) =>
    showToast('default', message, options),
  {
    success: (message: React.ReactNode, options?: ToastOptions) =>
      showToast('success', message, options),
    info: (message: React.ReactNode, options?: ToastOptions) =>
      showToast('info', message, options),
    warning: (message: React.ReactNode, options?: ToastOptions) =>
      showToast('warning', message, options),
    error: (message: React.ReactNode, options?: ToastOptions) =>
      showToast('error', message, options),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  }
);

export { Toaster, toast };
