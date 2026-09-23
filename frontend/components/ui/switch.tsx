import { cn } from '@/lib/utils';
import * as React from 'react';

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange'
> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!disabled && onCheckedChange) {
        onCheckedChange(e.target.checked);
      }
    };

    return (
      <label
        className={cn('relative inline-flex items-center cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}
      >
        <input
          type='checkbox'
          role='switch'
          aria-checked={checked}
          className='sr-only'
          ref={ref}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          {...props}
        />
        <div
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors',
            'bg-input border-2 border-transparent',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
            checked ? 'bg-primary' : 'bg-input',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          <span
            className={cn(
              'absolute top-[0.125rem] left-[0.125rem] h-5 w-5 rounded-full bg-background shadow-lg transition-transform',
              'border border-border',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </div>
      </label>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
