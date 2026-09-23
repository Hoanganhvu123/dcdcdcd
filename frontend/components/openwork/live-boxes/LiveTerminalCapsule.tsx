/**
 * Live Terminal & SQL Capsule
 * Monospace console with syntax highlighting, stopwatch timer, metrics pills, and Workbench drilldown
 * OpenWork Coworker Platform - Milestone 2
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Terminal,
  Database,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Table,
  Columns,
  Clock,
} from 'lucide-react';
import copy from 'copy-to-clipboard';
import type { OpenWorkArtifactTab } from '../types';
import type { LiveTerminalCapsuleProps } from './types';
import './styles/live-boxes.css';

import { formatStopwatchMs } from './entity-extractor';

export const LiveTerminalCapsule: React.FC<LiveTerminalCapsuleProps> = ({
  query,
  codeSnippet,
  language = 'sql',
  status = 'success',
  durationMs = 0,
  metrics,
  output,
  error,
  onSelectWorkbenchTab,
  onReconnect,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(durationMs);
  const isRunning = status === 'running';
  const isFailed = status === 'failed';
  const isSuccess = status === 'success';

  useEffect(() => {
    if (!isRunning) {
      setElapsedMs(durationMs);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 80);
    return () => clearInterval(interval);
  }, [isRunning, durationMs]);

  const rawCode = codeSnippet || query || '';
  const normalizedLang = (language || 'sql').toLowerCase();

  const handleCopy = useCallback(() => {
    if (!rawCode) return;
    try {
      copy(rawCode);
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(rawCode);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawCode]);

  const targetArtifactTab: OpenWorkArtifactTab = useMemo(() => {
    if (normalizedLang === 'sql' || metrics?.rowCount !== undefined) {
      return 'excel';
    }
    return 'code';
  }, [normalizedLang, metrics]);

  return (
    <div
      data-testid="live-terminal-capsule"
      className={`rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 font-mono overflow-hidden shadow-md transition-all ${className}`}
    >
      {/* Console Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/90 border-b border-zinc-800 text-xs select-none">
        {/* Left: Window Traffic Lights & Title */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal size={13} className="text-zinc-400" />
          <span className="font-semibold text-zinc-300 uppercase tracking-wide text-[0.6875rem]">
            {normalizedLang} console
          </span>
          {metrics?.databaseName && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[0.625rem] flex items-center gap-1">
              <Database size={10} />
              {metrics.databaseName}
            </span>
          )}
        </div>

        {/* Right: Live Stopwatch & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs tabular-nums">
            {isRunning ? (
              <>
                <Loader2 size={12} className="animate-spin text-emerald-400" />
                <span className="text-emerald-400 font-medium">
                  Running {formatStopwatchMs(elapsedMs)}...
                </span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>{formatStopwatchMs(elapsedMs)}</span>
              </>
            ) : (
              <>
                <AlertTriangle size={12} className="text-red-400" />
                <span className="text-red-400">Failed</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Đã sao chép' : 'Sao chép mã'}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Code Editor Surface */}
      <div className="p-3.5 overflow-x-auto custom-scrollbar text-xs leading-relaxed max-h-48">
        <pre className="text-emerald-300 font-mono whitespace-pre-wrap break-words">
          <code>{rawCode || '-- No execution snippet available'}</code>
        </pre>
      </div>

      {/* Metrics & Drilldown Footer Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/60 border-t border-zinc-800/80 text-xs">
        {/* Execution Metrics Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {metrics?.rowCount !== undefined && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[0.6875rem]">
              <Table size={11} className="text-zinc-400" />
              <span>{metrics.rowCount} rows</span>
            </span>
          )}
          {metrics?.colCount !== undefined && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[0.6875rem]">
              <Columns size={11} className="text-zinc-400" />
              <span>{metrics.colCount} cols</span>
            </span>
          )}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-400 text-[0.6875rem]">
            <Clock size={11} />
            <span>{formatStopwatchMs(elapsedMs)}</span>
          </span>
        </div>

        {/* Drilldown Workbench CTA */}
        {onSelectWorkbenchTab && (
          <button
            type="button"
            onClick={() => onSelectWorkbenchTab(targetArtifactTab)}
            className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-medium hover:underline transition-colors cursor-pointer"
          >
            <span>Mở trong Workbench</span>
            <ExternalLink size={11} />
          </button>
        )}
      </div>

      {/* Error Trace if Failed */}
      {isFailed && error && (
        <div className="p-3 bg-red-950/40 border-t border-red-900/60 text-red-200 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5 text-red-400">
              <AlertTriangle size={13} />
              <span>Lỗi thực thi lệnh</span>
            </span>
            {onReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="px-2 py-1 rounded bg-red-800/80 hover:bg-red-700 text-white text-[0.6875rem] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw size={10} />
                <span>Thử lại</span>
              </button>
            )}
          </div>
          <p className="font-mono text-[0.6875rem] bg-black/40 p-2 rounded border border-red-900/40 text-red-300">
            {error}
          </p>
        </div>
      )}
    </div>
  );
};
