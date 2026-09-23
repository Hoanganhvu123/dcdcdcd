import * as React from 'react';

import { cn } from '@/lib/utils';

type BaseInputProps = React.ComponentProps<'input'>;

interface CustomInputProps {
  error?: boolean;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

type InputProps = BaseInputProps & CustomInputProps;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, helperText, leftIcon, rightIcon, ...rest }, ref) => {
    const hasIconOrHelper = leftIcon || rightIcon || helperText;

    const inputEl = (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          error && 'border-destructive focus-visible:ring-destructive',
          leftIcon && 'pl-9',
          rightIcon && 'pr-9',
          className,
        )}
        ref={ref}
        {...rest}
      />
    );

    if (hasIconOrHelper) {
      return (
        <div className='relative w-full'>
          {leftIcon && (
            <div className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center justify-center'>
              {leftIcon}
            </div>
          )}
          {inputEl}
          {rightIcon && (
            <div className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center justify-center'>
              {rightIcon}
            </div>
          )}
          {helperText && (
            <p className={cn('text-xs mt-1', error ? 'text-destructive' : 'text-muted-foreground')}>{helperText}</p>
          )}
        </div>
      );
    }

    return inputEl;
  },
);
Input.displayName = 'Input';

export { Input };
