import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, ShieldAlert, CheckCircle2, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DoubleConfirmTier = 1 | 2 | 'standard' | 'destructive';
export type DoubleConfirmVariant = 'danger' | 'warning' | 'default';

export interface DoubleConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  actionName?: string;
  actionLabel?: string;
  cancelLabel?: string;
  tier?: DoubleConfirmTier;
  requiredPhrase?: string;
  variant?: DoubleConfirmVariant;
  impactSummary?: React.ReactNode;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export const DoubleConfirmModal: React.FC<DoubleConfirmModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  actionName,
  actionLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tier = 'standard',
  requiredPhrase,
  variant = 'danger',
  impactSummary,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const [typedPhrase, setTypedPhrase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTier2 =
    tier === 2 ||
    tier === 'destructive' ||
    (typeof requiredPhrase === 'string' && requiredPhrase.length > 0);

  const targetPhrase = requiredPhrase || (isTier2 ? (actionName ? actionName.toUpperCase() : 'CONFIRM') : '');

  // Reset typed phrase on open/close
  useEffect(() => {
    if (!open) {
      setTypedPhrase('');
      setIsSubmitting(false);
    }
  }, [open]);

  const isPhraseValid = !isTier2 || (typedPhrase.trim() === targetPhrase.trim());

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isPhraseValid || loading || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      // Keep modal open if error occurs
      console.error('[DoubleConfirmModal] Action failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const isDanger = variant === 'danger' || isTier2;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-lg p-5 sm:p-6 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl backdrop-blur-sm animate-in zoom-in-95 duration-150 text-[var(--fg)]">
        <AlertDialogHeader className="space-y-3">
          {/* Header Icon + Title */}
          <div className="flex items-start gap-3 text-left">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5',
                isDanger
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
              )}
            >
              {isTier2 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-base sm:text-lg font-semibold tracking-tight text-[var(--fg)]">
                {title}
              </AlertDialogTitle>
              {actionName && (
                <div className="text-xs font-mono text-[var(--muted-fg)] mt-0.5">
                  Tác vụ: <span className="font-semibold text-[var(--fg)]">{actionName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <AlertDialogDescription className="text-xs sm:text-sm text-[var(--muted-fg)] leading-relaxed text-left">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {/* Impact Summary Box */}
        {impactSummary && (
          <div className="my-2 p-3 rounded-xl border border-[var(--hair)] bg-[var(--panel)] text-xs text-[var(--fg2)] leading-normal text-left">
            {impactSummary}
          </div>
        )}

        {/* Tier 2 Typing Confirmation Form */}
        {isTier2 && (
          <div className="my-2 space-y-2 text-left">
            <label className="text-xs font-medium text-[var(--muted-fg)] block">
              Để xác nhận hành động nguy hiểm này, vui lòng nhập chính xác{' '}
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 select-all">
                {targetPhrase}
              </span>{' '}
              vào ô bên dưới:
            </label>
            <div className="relative">
              <input
                type="text"
                value={typedPhrase}
                onChange={(e) => setTypedPhrase(e.target.value)}
                placeholder={`Nhập "${targetPhrase}"...`}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-mono text-[var(--fg)] placeholder:text-[var(--muted-fg)] outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isPhraseValid && !loading && !isSubmitting) {
                    handleConfirm(e as any);
                  }
                }}
              />
              {typedPhrase.trim() === targetPhrase.trim() && targetPhrase.length > 0 && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-2.5 top-2.5" />
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <AlertDialogFooter className="flex flex-row items-center justify-end gap-2 pt-2 border-t border-[var(--hair)] mt-2">
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={loading || isSubmitting}
            className="h-8 px-3.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs font-medium text-[var(--fg2)] transition-colors"
          >
            {cancelLabel}
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isPhraseValid || loading || isSubmitting}
            className={cn(
              'h-8 px-4 rounded-lg text-xs font-medium text-white transition-all shadow-xs flex items-center gap-1.5',
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-600/40 disabled:cursor-not-allowed'
                : 'bg-[var(--primary)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {(loading || isSubmitting) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{actionLabel}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DoubleConfirmModal;
