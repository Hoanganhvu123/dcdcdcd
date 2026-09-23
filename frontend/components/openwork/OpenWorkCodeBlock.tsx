import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Check, FileCode, Terminal, BarChart2, Code as CodeIcon } from 'lucide-react';
import copy from 'copy-to-clipboard';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
// @ts-ignore
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { InteractiveChartBlock, type ChartType } from './charts/InteractiveChartBlock';
import { cn } from '@/lib/utils';

export interface OpenWorkCodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export const OpenWorkCodeBlock: React.FC<OpenWorkCodeBlockProps> = ({
  code,
  language = 'text',
  filename,
  className = '',
  showLineNumbers = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'code'>('chart');
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return (
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.documentElement.classList.contains('dark')
      );
    }
    return false;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkTheme = () => {
      const dark =
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.documentElement.classList.contains('dark');
      setIsDark(dark);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'openwork:theme' || e.key === 'ow:theme') {
        checkTheme();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const normalizedLang = useMemo(() => {
    const raw = (language || 'text').trim().toLowerCase().replace(/^language-/, '');
    if (raw === 'js') return 'javascript';
    if (raw === 'ts') return 'typescript';
    if (raw === 'py') return 'python';
    if (raw === 'sh' || raw === 'shell') return 'bash';
    if (raw === 'yml') return 'yaml';
    return raw;
  }, [language]);

  // ── DETECT CHART DATA / SPEC ──────────────────────────────────────────────
  const chartPayload = useMemo(() => {
    const isExplicitChartLang =
      normalizedLang.startsWith('chart') ||
      normalizedLang === 'vis-chart' ||
      normalizedLang === 'recharts' ||
      normalizedLang === 'plot';

    let explicitSubtype: ChartType = 'bar';
    if (normalizedLang.includes('line')) explicitSubtype = 'line';
    else if (normalizedLang.includes('area')) explicitSubtype = 'area';
    else if (normalizedLang.includes('pie') || normalizedLang.includes('donut')) explicitSubtype = 'pie';

    const trimmed = (code || '').trim();
    if (!trimmed) return null;

    // Try parsing as JSON
    try {
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed) && parsed.length > 0) {
          if (isExplicitChartLang || typeof parsed[0] === 'object') {
            return {
              title: filename || undefined,
              chartType: explicitSubtype,
              data: parsed,
            };
          }
        }

        if (typeof parsed === 'object' && parsed !== null) {
          if (
            isExplicitChartLang ||
            parsed.chartType ||
            parsed.type === 'chart' ||
            (parsed.categories && parsed.series) ||
            Array.isArray(parsed.data)
          ) {
            return {
              title: parsed.title || filename || undefined,
              chartType: (parsed.chartType || parsed.type || explicitSubtype) as ChartType,
              data: Array.isArray(parsed.data) ? parsed.data : undefined,
              categories: Array.isArray(parsed.categories) ? parsed.categories : undefined,
              series: Array.isArray(parsed.series) ? parsed.series : undefined,
              xAxisKey: parsed.xAxisKey || parsed.categoryLabel || undefined,
              description: parsed.description || parsed.takeaway || undefined,
            };
          }
        }
      }
    } catch {
      // Not JSON
    }

    if (isExplicitChartLang) {
      // Attempt TSV or comma-separated parsing
      const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delimiter).map((h) => h.trim());
        const dataRows = lines.slice(1).map((line) => {
          const cells = line.split(delimiter).map((c) => c.trim());
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => {
            const num = Number(cells[i]?.replace(/[$,%]/g, ''));
            obj[h] = !isNaN(num) && cells[i] !== '' ? num : cells[i];
          });
          return obj;
        });

        return {
          title: filename || 'Biểu đồ dữ liệu',
          chartType: explicitSubtype,
          data: dataRows,
          xAxisKey: headers[0],
        };
      }
    }

    return null;
  }, [code, normalizedLang, filename]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    try {
      copy(code);
    } catch {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
      }
    }
    setCopied(true);
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [code]);

  // If a chart payload was detected and viewMode is 'chart', render InteractiveChartBlock with toggle
  if (chartPayload && viewMode === 'chart') {
    return (
      <div className="relative my-4">
        <div className="absolute right-3 top-2.5 z-20 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('code')}
            title="Xem mã nguồn / Raw JSON"
            className="flex h-6 items-center gap-1 rounded-md border border-border/80 bg-background/90 px-2 text-[0.6875rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground shadow-2xs transition-colors cursor-pointer"
          >
            <CodeIcon size={12} />
            <span>Mã nguồn</span>
          </button>
        </div>
        <InteractiveChartBlock
          title={chartPayload.title}
          chartType={chartPayload.chartType}
          data={chartPayload.data}
          categories={chartPayload.categories}
          series={chartPayload.series}
          xAxisKey={chartPayload.xAxisKey}
          description={chartPayload.description}
          className={className}
        />
      </div>
    );
  }

  return (
    <div
      data-openwork-code-block="true"
      className={cn(
        "relative my-3 overflow-hidden rounded-xl border font-mono text-xs leading-6 shadow-xs transition-colors duration-150",
        isDark
          ? "border-zinc-800/80 bg-[#1e1d1a] text-zinc-100"
          : "border-[#e2dcce] bg-[#f4efe6] text-[#2c2825]",
        className
      )}
    >
      {/* Header bar with icon and language badge */}
      <div className="absolute left-3.5 top-2.5 z-10 flex items-center gap-2 select-none">
        {normalizedLang === 'bash' || normalizedLang === 'sh' ? (
          <Terminal size={13} className={isDark ? "text-zinc-400" : "text-[#7d786d]"} />
        ) : (
          <FileCode size={13} className={isDark ? "text-zinc-400" : "text-[#7d786d]"} />
        )}
        <span
          className={cn(
            "text-xs font-mono font-medium uppercase tracking-wider",
            isDark ? "text-zinc-400" : "text-[#655f54]"
          )}
        >
          {filename || normalizedLang}
        </span>
      </div>

      {/* Action buttons: Switch to Chart (if payload available) & Copy */}
      <div className="absolute right-2.5 top-2 z-10 flex items-center gap-1.5">
        {chartPayload && (
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            title="Xem biểu đồ tương tác"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[0.6875rem] font-medium shadow-2xs transition-colors focus-visible:outline-none cursor-pointer",
              isDark
                ? "border-zinc-700/60 bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                : "border-[#d8d2c4] bg-[#eae4d8]/90 text-[#4c473c] hover:bg-[#ded7ca] hover:text-[#171614]"
            )}
          >
            <BarChart2 size={12} className={isDark ? "text-primary" : "text-[#da7756]"} />
            <span>Biểu đồ</span>
          </button>
        )}

        <button
          type="button"
          data-openwork-code-copy="true"
          onClick={handleCopy}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md border shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
            isDark
              ? "border-zinc-700/60 bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              : "border-[#d8d2c4] bg-[#eae4d8]/90 text-[#4c473c] hover:bg-[#ded7ca] hover:text-[#171614]"
          )}
          aria-label={copied ? 'Code block copied' : 'Copy code block'}
          title={copied ? 'Đã chép' : 'Sao chép mã nguồn'}
        >
          {copied ? (
            <Check size={13} className="text-emerald-500" />
          ) : (
            <Copy size={13} />
          )}
          <span className="sr-only">{copied ? 'Code block copied' : 'Copy code block'}</span>
        </button>
      </div>

      {/* Code body with top padding pt-10 for header clearance and horizontal scrollbar */}
      <div className="overflow-x-auto px-4 pb-3 pt-10 custom-scrollbar">
        <SyntaxHighlighter
          language={normalizedLang}
          style={isDark ? oneDark : oneLight}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            padding: 0,
            background: 'transparent',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            fontFamily: 'inherit',
          }}
          codeTagProps={{
            className: `language-${normalizedLang} font-mono text-xs ${isDark ? 'text-zinc-100' : 'text-[#2c2825]'}`,
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
