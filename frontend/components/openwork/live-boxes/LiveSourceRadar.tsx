/**
 * Live Source Radar
 * Circular radar sweep visualizer tracking real-time web queries, domain badges, and Google favicons
 * OpenWork Coworker Platform - Milestone 2
 */

import React, { useState, useMemo } from 'react';
import {
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Compass,
  Search,
  CheckCircle2,
} from 'lucide-react';
import type { WebSearchResult } from '../types';
import type { LiveSourceRadarProps } from './types';
import { cleanDomain, getFaviconUrl } from './entity-extractor';
import './styles/live-boxes.css';

export const LiveSourceRadar: React.FC<LiveSourceRadarProps> = ({
  query = '',
  results = [],
  isScanning = false,
  activeTarget,
  scannedCount,
  onSelectSource,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(true);
  const totalScanned = scannedCount || Math.max(results.length * 3, 8);

  const displayTarget = activeTarget || query || 'Đang quét nguồn dữ liệu trực tuyến...';

  return (
    <div
      data-testid="live-source-radar"
      className={`rounded-xl border border-border/80 bg-card/80 overflow-hidden shadow-xs transition-all ${className}`}
    >
      {/* Header Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded);
        }}
        className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Radar Icon / Live Indicator */}
          <div className="relative w-5 h-5 flex items-center justify-center">
            <Compass
              size={16}
              className={`text-primary ${isScanning ? 'animate-spin' : ''}`}
            />
            {isScanning && (
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Live Source Radar
              </span>
              <span className="px-1.5 py-px rounded-full bg-primary/10 text-primary text-[0.625rem] font-medium">
                {results.length} nguồn trích xuất
              </span>
            </div>
            <span className="text-[0.6875rem] text-muted-foreground truncate font-mono">
              {isScanning ? `Target: "${displayTarget}"` : `Truy vấn: "${query || 'Đa nguồn'}"`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[0.6875rem] text-muted-foreground font-mono">
            {totalScanned} scanned
          </span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Expanded Scanner Body */}
      {expanded && (
        <div className="border-t border-border/60 p-3.5 space-y-3 bg-muted/10">
          {/* Top: Radar Sweep Graphic Visualization */}
          <div className="relative w-full h-28 rounded-lg bg-zinc-950/95 border border-zinc-800 overflow-hidden flex items-center justify-center">
            {/* Concentric Rings */}
            <div className="absolute w-24 h-24 rounded-full border border-emerald-500/20" />
            <div className="absolute w-16 h-16 rounded-full border border-emerald-500/30" />
            <div className="absolute w-8 h-8 rounded-full border border-emerald-500/40" />

            {/* Radar Crosshairs */}
            <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-500/20" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/20" />

            {/* Rotating Radar Sweep Cone */}
            <div className="absolute w-24 h-24 rounded-full live-radar-sweep-beam pointer-events-none" />

            {/* Radar Blip Dots */}
            {results.slice(0, 6).map((res, i) => {
              const angles = [35, 115, 195, 265, 325, 75];
              const dists = [20, 32, 38, 26, 42, 16];
              const rad = (angles[i % angles.length] * Math.PI) / 180;
              const d = dists[i % dists.length];
              const left = 50 + (d * Math.cos(rad));
              const top = 50 + (d * Math.sin(rad));
              const domain = cleanDomain(res.url);

              return (
                <div
                  key={`blip-${res.url}-${i}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  className="absolute w-2.5 h-2.5 -ml-1.25 -mt-1.25 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse cursor-pointer"
                  title={`${domain}: ${res.title}`}
                  onClick={() => onSelectSource?.(res)}
                />
              );
            })}

            <div className="absolute bottom-1.5 left-2 text-[0.625rem] text-emerald-400/80 font-mono tracking-wider">
              RADAR ACTIVE // SCAN 360° // {results.length} NODES
            </div>
          </div>

          {/* Extracted Source Pills Strip */}
          {results.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {results.map((res, i) => {
                const domain = cleanDomain(res.url);
                const favicon = res.favicon || getFaviconUrl(res.url);
                return (
                  <a
                    key={`pill-${res.url}-${i}`}
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onSelectSource?.(res)}
                    className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/70 bg-card hover:bg-accent/60 hover:border-border text-xs transition-all cursor-pointer shadow-xs"
                  >
                    <img
                      src={favicon}
                      alt=""
                      className="w-3.5 h-3.5 rounded-sm object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-[0.6875rem] font-medium text-foreground">
                      {domain}
                    </span>
                    <span className="text-[0.625rem] text-muted-foreground font-mono">
                      #{i + 1}
                    </span>
                    <ExternalLink
                      size={10}
                      className="text-muted-foreground group-hover:text-foreground transition-colors"
                    />
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-2 text-xs text-muted-foreground font-mono">
              Chưa có nguồn nào được trích xuất
            </div>
          )}

          {/* Snippet Preview Cards (First 2) */}
          {results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {results.slice(0, 2).map((res, i) => (
                <div
                  key={`snippet-${res.url}-${i}`}
                  className="p-2.5 rounded-lg border border-border/60 bg-card/90 space-y-1 text-xs"
                >
                  <div className="font-medium text-foreground truncate text-[0.75rem] flex items-center justify-between">
                    <span className="truncate">{res.title || cleanDomain(res.url)}</span>
                    <span className="text-[0.625rem] text-muted-foreground shrink-0 font-mono">
                      #{i + 1}
                    </span>
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground line-clamp-2 leading-relaxed">
                    {res.snippet || 'Trích xuất đoạn trích từ tài liệu nguồn trực tuyến.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
