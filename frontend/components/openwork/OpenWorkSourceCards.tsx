import React, { useState } from 'react';
import { Globe, ExternalLink, ChevronDown } from 'lucide-react';
import type { WebSearchResult } from './types';
import { isSafeUrl } from '@/lib/security/sanitizer';

interface OpenWorkSourceCardsProps {
  query: string;
  results: WebSearchResult[];
}

export const OpenWorkSourceCards: React.FC<OpenWorkSourceCardsProps> = ({ query, results }) => {
  const [expanded, setExpanded] = useState(true);
  
  if (!results || results.length === 0) return null;
  
  const getDomain = (url: string) => {
    if (!isSafeUrl(url)) return 'untrusted-source';
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  };

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card/50 overflow-hidden transition-all">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Globe size={14} className="text-foreground shrink-0" />
        <span>{results.length} sources found</span>
        <span className="text-muted-foreground/60 truncate flex-1 text-left">— "{query}"</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Cards Strip */}
      {expanded && (
        <div className="px-3 pb-3 overflow-x-auto custom-scrollbar">
          <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
            {results.map((result, i) => {
              const safeUrl = isSafeUrl(result.url) ? result.url : '#';
              const domain = getDomain(result.url);
              return (
                <a
                  key={`${result.url}-${i}`}
                  href={safeUrl}
                  target={safeUrl !== '#' ? '_blank' : undefined}
                  rel={safeUrl !== '#' ? 'noopener noreferrer' : undefined}
                  className="group flex flex-col gap-1.5 p-2.5 rounded-lg border border-border/50 bg-background hover:bg-accent/40 hover:border-border hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer"
                  style={{ width: '12.5rem', minWidth: '12.5rem' }}
                >
                  {/* Domain Row */}
                  <div className="flex items-center gap-1.5">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`}
                      alt=""
                      className="w-4 h-4 rounded-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-[0.6875rem] text-muted-foreground truncate flex-1">{domain}</span>
                    <ExternalLink size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity ml-auto" />
                  </div>
                  {/* Title */}
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                    {result.title}
                  </p>
                  {/* Snippet */}
                  <p className="text-[0.6875rem] text-muted-foreground leading-relaxed line-clamp-2">
                    {result.snippet}
                  </p>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
