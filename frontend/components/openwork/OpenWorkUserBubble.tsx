import React, { useState, useCallback } from 'react';
import { Copy, Check, Pencil, Split, Undo2 } from 'lucide-react';
import type { UserMessagePart } from './types';
import { cn } from '@/lib/utils';

export interface OpenWorkUserBubbleProps {
  part: UserMessagePart;
  onEdit?: (id: string, text: string) => void;
  onFork?: (id: string) => void;
  onRevert?: (id: string) => void;
  isStreaming?: boolean;
  highlightQuery?: string;
  className?: string;
}

// Regex definitions for skill tokens & links
const USER_SKILL_TOKEN_RE = /(Load \[skill [^\]]+\] and follow its instructions\.|\[skill [^\]]+\])/;
const PLAIN_URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
const SEARCH_HIGHLIGHT_MARK_CLASS = 'rounded px-0.5 bg-amber-400/30 text-inherit';

export function faviconUrlForHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname === 'localhost') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=32`;
  } catch {
    return null;
  }
}

export function UserSkillChip({ name }: { name: string }) {
  return (
    <span
      className="mx-0.5 inline-flex items-center rounded-[5px] border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-[var(--fg)] align-middle"
      title={`Skill: ${name}`}
    >
      {name}
    </span>
  );
}

export function renderPlainTextWithSearchHighlights(
  text: string,
  highlightQuery: string | undefined,
  keyPrefix: string
): React.ReactNode {
  const needle = highlightQuery?.trim().toLowerCase() ?? '';
  if (needle.length < 2) return text;

  const lower = text.toLowerCase();
  if (!lower.includes(needle)) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lower.indexOf(needle);
  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex));
    }
    const end = matchIndex + needle.length;
    nodes.push(
      <mark
        key={`${keyPrefix}:match:${matchIndex}`}
        data-search-highlight="true"
        className={SEARCH_HIGHLIGHT_MARK_CLASS}
      >
        {text.slice(matchIndex, end)}
      </mark>
    );
    cursor = end;
    matchIndex = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

export function renderPlainTextWithLinks(
  text: string,
  highlightQuery: string | undefined,
  keyPrefix: string
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const start = match.index ?? 0;
    const url = match[0];
    if (start > cursor) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}:pre:${cursor}`}>
          {renderPlainTextWithSearchHighlights(text.slice(cursor, start), highlightQuery, `${keyPrefix}:pre:${cursor}`)}
        </React.Fragment>
      );
    }
    const favicon = faviconUrlForHref(url);
    nodes.push(
      <a
        key={`${keyPrefix}:url:${start}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[var(--primary)] hover:underline inline-flex items-center gap-1 break-all align-middle"
      >
        {favicon && (
          <img
            src={favicon}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="inline-block size-3.5 rounded-xs align-sub shrink-0"
          />
        )}
        <span>{url}</span>
      </a>
    );
    cursor = start + url.length;
  }
  if (nodes.length === 0) return renderPlainTextWithSearchHighlights(text, highlightQuery, keyPrefix);
  if (cursor < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}:post:${cursor}`}>
        {renderPlainTextWithSearchHighlights(text.slice(cursor), highlightQuery, `${keyPrefix}:post:${cursor}`)}
      </React.Fragment>
    );
  }
  return nodes;
}

export function renderUserTextWithSkillChips(
  text: string,
  highlightQuery: string | undefined
): React.ReactNode {
  if (!USER_SKILL_TOKEN_RE.test(text)) return renderPlainTextWithLinks(text, highlightQuery, 'text');
  let offset = 0;
  return text.split(USER_SKILL_TOKEN_RE).map((segment) => {
    const key = `${offset}:${segment}`;
    offset += segment.length;
    const skillMatch = segment.match(/^(?:Load )?\[skill ([^\]]+)\](?: and follow its instructions\.)?$/);
    if (skillMatch?.[1]) return <UserSkillChip key={key} name={skillMatch[1]} />;
    return <React.Fragment key={key}>{renderPlainTextWithLinks(segment, highlightQuery, key)}</React.Fragment>;
  });
}

export const OpenWorkUserBubble: React.FC<OpenWorkUserBubbleProps> = ({
  part,
  onEdit,
  onFork,
  onRevert,
  isStreaming = false,
  highlightQuery,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!part.text) return;
    try {
      await navigator.clipboard.writeText(part.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }, [part.text]);

  return (
    <div
      className="user-bubble-container group flex w-full flex-col items-end justify-end ml-auto gap-1.5 my-2.5 !select-text not-prose animate-ow-in"
      style={{ userSelect: 'text' }}
      data-message-id={part.id}
      data-message-role="user"
      data-line="user"
    >
      {/* ── User Message Bubble (from Chat DeepThink.dc.html:129) ── */}
      <div
        className={cn(
          "user-bubble ow-user-bubble max-w-[78%] rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-[13px] py-[9px] text-[0.84375rem] font-normal leading-[1.65] text-[var(--fg)] shadow-[var(--shadow)] !select-text not-prose font-sans",
          className
        )}
        style={{ userSelect: 'text' }}
      >
        <div className="whitespace-pre-wrap break-words">
          {renderUserTextWithSkillChips(part.text, highlightQuery)}
        </div>
      </div>

      {/* ── Hover Action Bar ── */}
      {!isStreaming && (
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-150 px-1 select-none"
          aria-label="Tùy chọn tin nhắn"
        >
          {part.timestamp && (
            <span className="text-[0.6875rem] tabular-nums text-[var(--muted-fg)] font-mono select-none mr-1">
              {part.timestamp}
            </span>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Đã sao chép' : 'Sao chép tin nhắn'}
            title={copied ? 'Đã sao chép' : 'Sao chép'}
            className="h-[26px] w-[26px] rounded-[6px] flex items-center justify-center text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] border border-transparent hover:border-[var(--border)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
          >
            {copied ? <Check size={13} strokeWidth={1.8} className="text-[var(--ok)]" /> : <Copy size={13} strokeWidth={1.8} />}
          </button>

          {/* Edit Button */}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(part.id, part.text)}
              aria-label="Chỉnh sửa tin nhắn"
              title="Chỉnh sửa"
              className="h-[26px] w-[26px] rounded-[6px] flex items-center justify-center text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] border border-transparent hover:border-[var(--border)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          )}

          {/* Fork Button */}
          {onFork && (
            <button
              type="button"
              onClick={() => onFork(part.id)}
              aria-label="Tạo nhánh hội thoại mới"
              title="Tạo nhánh hội thoại mới"
              className="h-[26px] w-[26px] rounded-[6px] flex items-center justify-center text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] border border-transparent hover:border-[var(--border)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <Split size={13} strokeWidth={1.8} className="rotate-90" />
            </button>
          )}

          {/* Revert Button */}
          {onRevert && (
            <button
              type="button"
              onClick={() => onRevert(part.id)}
              aria-label="Quay lại điểm này"
              title="Quay lại điểm này"
              className="h-[26px] w-[26px] rounded-[6px] flex items-center justify-center text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] border border-transparent hover:border-[var(--border)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <Undo2 size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default OpenWorkUserBubble;
