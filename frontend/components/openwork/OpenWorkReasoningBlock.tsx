import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReasoningPart } from './types';
import './styles/openwork-legal.css';

export interface OpenWorkReasoningBlockProps {
  part?: ReasoningPart;
  reasoningContent?: string;
  durationMs?: number;
  isStreaming?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  className?: string;
  latencyBadge?: string;
  hint?: string;
}

/**
 * Strips raw model artifact tags (<think>, </think>, TODO:: markers)
 */
export const cleanThoughtContent = (text?: string): string => {
  if (!text) return '';
  return text
    .replace(/^<think>\s*/i, '')
    .replace(/\s*<\/think>$/i, '')
    .replace(/^TODO::[^\n]*/gm, '')
    .trim();
};

/**
 * OpenWorkReasoningBlock
 * Cuccu Legal Workspace Collapsible Reasoning Block (.legal-think-box)
 * Features:
 * - Collapsible expansion with Framer Motion spring physics
 * - Pulsing lavender-purple dot (#9b8fb0) during streaming, neutral dot (#cfcbc4) when completed
 * - Uppercase gold-amber "SUY LUẬN" tag (#7d5411)
 * - Ellipsis hint summary text
 * - Search latency indicator badge ("Đã tra cứu trong 340ms" or dynamic duration)
 * - Rotating chevron fold indicator
 * - Lora italic typography body (12.5px, line-height 1.85, color #5c5766)
 * - Zero hardcoded px typography classes in TSX for full fluid/responsive adherence
 */
export const OpenWorkReasoningBlock: React.FC<OpenWorkReasoningBlockProps> = ({
  part,
  reasoningContent,
  durationMs: explicitDurationMs,
  isStreaming: explicitIsStreaming,
  isOpen: controlledIsOpen,
  defaultOpen = false,
  className = '',
  latencyBadge,
  hint,
}) => {
  const isStreaming = Boolean(part?.isStreaming ?? explicitIsStreaming);
  const rawThought = part?.thought ?? reasoningContent ?? '';
  const durationMs = part?.durationMs ?? explicitDurationMs;

  const [userToggledOpen, setUserToggledOpen] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const streamStartRef = useRef<number>(Date.now());

  // Track live streaming duration
  useEffect(() => {
    if (isStreaming) {
      streamStartRef.current = Date.now();
      const timer = setInterval(() => {
        const secs = Math.max(1, Math.round((Date.now() - streamStartRef.current) / 1000));
        setElapsedSeconds(secs);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isStreaming]);

  // Collapsible state: if not user-toggled, auto-open when streaming or when defaultOpen is set
  const isOpen = controlledIsOpen !== undefined
    ? controlledIsOpen
    : userToggledOpen !== null
      ? userToggledOpen
      : (isStreaming || defaultOpen);

  const cleanedThought = useMemo(() => cleanThoughtContent(rawThought), [rawThought]);
  const wordCount = useMemo(() => (cleanedThought ? cleanedThought.split(/\s+/).filter(Boolean).length : 0), [cleanedThought]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanedThought) return;
    navigator.clipboard.writeText(cleanedThought).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // ignore clipboard error
    });
  }, [cleanedThought]);

  // Standard trigger label matching streaming / elapsed state
  const triggerLabel = useMemo(() => {
    if (isStreaming) return '🧠 Đang suy luận…';
    if (durationMs && durationMs > 0) {
      const secs = Math.max(1, Math.round(durationMs / 1000));
      return `🧠 Đã suy luận trong ${secs}s (${wordCount} từ)`;
    }
    if (elapsedSeconds > 0) {
      return `🧠 Đã suy luận trong ${elapsedSeconds}s (${wordCount} từ)`;
    }
    return `🧠 Đã suy luận trong 4s (${wordCount} từ)`;
  }, [isStreaming, durationMs, elapsedSeconds, wordCount]);

  // Compute hint summary line
  const displayHint = useMemo(() => {
    if (hint) return hint;
    if (part?.title) return part.title;
    if (isStreaming) return 'đang phân tích điều khoản và khung pháp lý áp dụng…';
    if (cleanedThought) {
      const firstLine = cleanedThought.split('\n')[0].replace(/^[#*-]\s*/, '').trim();
      if (firstLine.length > 0 && firstLine.length < 90) return firstLine;
    }
    return triggerLabel;
  }, [hint, part?.title, isStreaming, cleanedThought, triggerLabel]);

  // Compute search latency badge
  const displayLatency = useMemo(() => {
    if (latencyBadge) return latencyBadge;
    if (durationMs && durationMs > 0) {
      if (durationMs < 1000) return `Đã tra cứu trong ${durationMs}ms`;
      const secs = (durationMs / 1000).toFixed(1).replace('.0', '');
      return `Đã tra cứu trong ${secs}s`;
    }
    return 'Đã tra cứu trong 340ms';
  }, [latencyBadge, durationMs]);

  return (
    <div
      data-line="reasoning"
      data-reasoning-block=""
      className={`legal-think-box select-text not-prose w-full my-2 animate-cuccu-up ${className}`}
      style={{ animation: 'wkUp 0.22s ease both' }}
    >
      {/* ── Collapsible Header Bar ── */}
      <button
        type="button"
        onClick={() => setUserToggledOpen(!isOpen)}
        className="legal-think-header"
        aria-expanded={isOpen}
      >
        {/* Pulsing indicator dot: #9b8fb0 when streaming, #cfcbc4 when done */}
        <span
          className={`legal-think-dot pulse-dot-gold cuccuPulse ${isStreaming ? 'is-streaming animate-pulse animate-cuccu-pulse' : 'is-done'}`}
          aria-hidden="true"
        />

        {/* Legal Tag */}
        <span className="legal-think-tag">
          Suy luận
        </span>

        {/* Hint Summary Text */}
        <span className="legal-think-hint">
          {displayHint}
        </span>

        {/* Latency Indicator Badge */}
        <span className="legal-think-ms">
          {displayLatency}
        </span>

        {/* Copy thought button on hover */}
        {cleanedThought && !isStreaming && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleCopy}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCopy(e as unknown as React.MouseEvent); }}
            title={copied ? 'Đã sao chép' : 'Sao chép chuỗi suy luận'}
            aria-label={copied ? 'Đã sao chép' : 'Sao chép'}
            className="legal-think-copy-btn"
          >
            {copied ? <Check size={11} className="text-emerald-600 inline" /> : <Copy size={11} className="inline" />}
          </span>
        )}

        {/* Chevron Fold Indicator */}
        <span
          className={`legal-think-chev ${isOpen ? 'is-open' : 'is-folded'}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {/* ── Expandable Reasoning Body with Lora Italic Typography ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="overflow-hidden"
          >
            <div className="legal-think-body vis-thinking-body border-amber-500/35 italic max-h-[380px] overflow-y-auto custom-scrollbar">
              {cleanedThought || (isStreaming ? 'Đang khởi tạo các bước suy luận…' : '')}
              {isStreaming && (
                <span className="legal-think-caret" aria-hidden="true" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OpenWorkReasoningBlock;
