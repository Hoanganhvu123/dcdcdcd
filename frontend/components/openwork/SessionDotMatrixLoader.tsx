import * as React from 'react';
import { DotMatrixLoader } from './DotMatrixLoader';
import { cn } from '@/lib/utils';

export type OutcomeStatus = 'running' | 'completed' | 'active' | 'unread' | 'needs-action' | 'failed' | 'idle';

export interface SessionDotMatrixLoaderProps {
  className?: string;
  label: string;
}

/**
 * Sidebar left-lane activity indicator — shared dot-matrix in the fixed slot.
 */
export function SessionDotMatrixLoader({ className, label }: SessionDotMatrixLoaderProps) {
  return (
    <DotMatrixLoader
      data-session-loading-indicator=""
      label={label}
      className={cn('text-sidebar-foreground', className)}
    />
  );
}

export interface OutcomeStatusDotProps {
  status: OutcomeStatus;
  label?: string;
  className?: string;
}

/**
 * Outcome status dot indicator:
 * - #2FBE54: active / completed / unread success
 * - #E8933A: needs-action / failed / attention
 * - SessionDotMatrixLoader: running activity
 */
export function OutcomeStatusDot({ status, label, className }: OutcomeStatusDotProps) {
  if (status === 'running') {
    return <SessionDotMatrixLoader label={label || 'Đang xử lý'} className={className} />;
  }
  if (status === 'active' || status === 'completed' || status === 'unread') {
    return (
      <span
        className={cn('w-2 h-2 rounded-full shrink-0 shadow-sm transition-transform hover:scale-110', className)}
        style={{ backgroundColor: '#2FBE54' }}
        title={label || 'Hoàn thành / Đang hoạt động'}
        aria-label={label || 'Hoàn thành / Đang hoạt động'}
      />
    );
  }
  if (status === 'needs-action' || status === 'failed') {
    return (
      <span
        className={cn('w-2 h-2 rounded-full shrink-0 shadow-sm transition-transform hover:scale-110', className)}
        style={{ backgroundColor: '#E8933A' }}
        title={label || 'Cần chú ý / Thao tác'}
        aria-label={label || 'Cần chú ý / Thao tác'}
      />
    );
  }
  return <span className={cn('w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0', className)} />;
}

export default SessionDotMatrixLoader;
