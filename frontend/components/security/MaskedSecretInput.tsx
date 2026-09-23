import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MaskedSecretInputProps {
  value: string;
  onChange?: (val: string) => void;
  onSave?: (val: string) => void;
  onClear?: () => void;
  label?: string | React.ReactNode;
  placeholder?: string;
  autoHideSeconds?: number;
  allowCopy?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
  icon?: React.ElementType;
  badge?: React.ReactNode;
  hint?: React.ReactNode;
}

/**
 * Safe clipboard copy with automatic wipe after specified delay.
 * Returns a cleanup function that cancels the scheduled wipe.
 */
export function safeCopyToClipboard(text: string, wipeDelayMs = 30000): () => void {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !text) {
    return () => {};
  }

  navigator.clipboard.writeText(text).catch(() => {});

  const timeoutId = setTimeout(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    } catch {
      // Ignore background tab clipboard errors
    }
  }, wipeDelayMs);

  return () => clearTimeout(timeoutId);
}

export const MaskedSecretInput: React.FC<MaskedSecretInputProps> = ({
  value,
  onChange,
  onSave,
  onClear,
  label,
  placeholder = '••••••••••••••••••••••••••••••••',
  autoHideSeconds = 15,
  allowCopy = true,
  allowClear = false,
  disabled = false,
  readOnly = false,
  className,
  inputClassName,
  id,
  name,
  autoComplete = 'off',
  icon: Icon,
  badge,
  hint,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardWipeCleanupRef = useRef<(() => void) | null>(null);

  // Clear countdown interval
  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingSeconds(0);
  }, []);

  // Hide secret and reset countdown
  const hideSecret = useCallback(() => {
    setIsRevealed(false);
    clearCountdown();
  }, [clearCountdown]);

  // Reveal secret and start countdown
  const revealSecret = useCallback(() => {
    setIsRevealed(true);
    setRemainingSeconds(autoHideSeconds);
    clearCountdown();

    countdownIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          hideSecret();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [autoHideSeconds, clearCountdown, hideSecret]);

  // Toggle reveal
  const handleToggleReveal = useCallback(() => {
    if (isRevealed) {
      hideSecret();
    } else {
      revealSecret();
    }
  }, [isRevealed, hideSecret, revealSecret]);

  // Auto-mask on window blur (user switches tab or window loses focus)
  useEffect(() => {
    const handleWindowBlur = () => {
      if (isRevealed) {
        hideSecret();
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isRevealed, hideSecret]);

  // Copy with 30s auto-wipe
  const handleCopy = useCallback(() => {
    if (!value || disabled) return;

    if (clipboardWipeCleanupRef.current) {
      clipboardWipeCleanupRef.current();
    }

    clipboardWipeCleanupRef.current = safeCopyToClipboard(value, 30000);
    setCopied(true);

    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [value, disabled]);

  // Clear value handler
  const handleClear = useCallback(() => {
    if (disabled || readOnly) return;
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange('');
    }
  }, [disabled, readOnly, onClear, onChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCountdown();
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      if (clipboardWipeCleanupRef.current) clipboardWipeCleanupRef.current();
    };
  }, [clearCountdown]);

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || badge) && (
        <div className="flex items-center justify-between">
          {label && (
            <label
              htmlFor={id}
              className="font-semibold text-foreground flex items-center gap-1.5 text-xs"
            >
              {Icon && <Icon size={13} className="text-primary shrink-0" />}
              {typeof label === 'string' ? <span>{label}</span> : label}
            </label>
          )}
          {badge && <div className="text-[0.6875rem]">{badge}</div>}
        </div>
      )}

      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          type={isRevealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete={autoComplete}
          spellCheck={false}
          className={cn(
            'w-full pl-3 pr-24 py-2 text-xs rounded-lg border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            inputClassName
          )}
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {/* Remaining countdown indicator when revealed */}
          {isRevealed && remainingSeconds > 0 && (
            <span
              className="text-[0.625rem] px-1.5 py-0.5 font-mono font-medium rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              title={`Tự động ẩn sau ${remainingSeconds} giây`}
            >
              {remainingSeconds}s
            </span>
          )}

          {/* Reveal / Hide toggle */}
          <button
            type="button"
            onClick={handleToggleReveal}
            disabled={disabled || !value}
            title={isRevealed ? 'Ẩn khóa bảo mật' : 'Hiển thị khóa (tự động ẩn sau 15 giây)'}
            aria-label={isRevealed ? 'Hide secret' : 'Reveal secret'}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent disabled:opacity-40 transition-colors"
          >
            {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>

          {/* Safe copy with 30s auto-wipe */}
          {allowCopy && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled || !value}
              title="Sao chép an toàn (tự xóa bộ nhớ tạm sau 30s)"
              aria-label="Safe copy to clipboard"
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {copied ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} />
              )}
            </button>
          )}

          {/* Clear button */}
          {(allowClear || onClear) && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || readOnly || !value}
              title="Xóa khóa"
              aria-label="Clear secret"
              className="p-1 text-muted-foreground hover:text-rose-500 rounded hover:bg-rose-500/10 disabled:opacity-40 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {hint && <div className="text-[0.6875rem] text-muted-foreground">{hint}</div>}
    </div>
  );
};

export default MaskedSecretInput;
