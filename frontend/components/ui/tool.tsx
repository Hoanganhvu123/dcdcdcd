import * as React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bot,
  Check,
  ChevronDown,
  AlertCircle,
  Copy,
  FileEdit,
  Key,
  ListOrdered,
  Loader2,
  HelpCircle,
  RefreshCw,
  Search,
  Sparkles,
  Code2,
  Wrench,
} from 'lucide-react';

export type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  state: 'in-flight' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type StaticToolPart = {
  type: string;
  state: 'in-flight' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
};

export type ToolPart = DynamicToolUIPart | StaticToolPart;

export type ToolProps = {
  title?: string;
  toolPart: ToolPart;
  defaultOpen?: boolean;
  className?: string;
  onRetry?: () => void | Promise<void>;
};

function toolIcon(part: ToolPart) {
  const name = part.type === 'dynamic-tool' ? part.toolName : part.type;
  switch (name) {
    case 'edit':
    case 'write':
    case 'apply_patch':
      return FileEdit;
    case 'grep':
    case 'glob':
      return Search;
    case 'lsp':
      return Code2;
    case 'skill':
      return Sparkles;
    case 'todowrite':
      return ListOrdered;
    case 'question':
      return HelpCircle;
    case 'request_env_var':
    case 'env_var_request':
      return Key;
    case 'task':
      return Bot;
    default:
      return Wrench;
  }
}

const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

export const Tool = ({
  title,
  toolPart,
  defaultOpen = false,
  className,
  onRetry,
}: ToolProps) => {
  const { state, input } = toolPart;
  const inFlight = state === 'in-flight';
  const isError = state === 'output-error';
  const label =
    title ?? (toolPart.type === 'dynamic-tool' ? toolPart.toolName : toolPart.type);
  const hasInput = input !== null && input !== undefined;
  const hasOutput = 'output' in toolPart && toolPart.output !== undefined;
  const resultText = hasOutput
    ? formatValue(toolPart.output)
    : isError && toolPart.errorText
      ? toolPart.errorText
      : null;
  const Icon = toolIcon(toolPart);
  const [copied, setCopied] = React.useState(false);

  const handleCopyResult = React.useCallback(async () => {
    if (resultText === null) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failure in non-secure context
    }
  }, [resultText]);

  return (
    <Collapsible className={className} defaultOpen={defaultOpen}>
      <div className="flex min-w-0 items-center gap-2" aria-live="polite">
        <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 overflow-hidden text-start text-sm transition-colors">
          <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
            <span className="transition-opacity group-hover:opacity-0">
              {inFlight ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
              ) : isError ? (
                <AlertCircle className="text-destructive size-4" strokeWidth={1.5} />
              ) : (
                <Icon className="size-3.5" strokeWidth={1.5} />
              )}
            </span>
            <ChevronDown
              className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:rotate-180"
              strokeWidth={1.5}
            />
          </span>
          <span className="min-w-0 truncate">{String(label ?? '')}</span>
          {isError ? (
            <span className="text-destructive shrink-0 text-xs">failed</span>
          ) : null}
        </CollapsibleTrigger>
        {isError && onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => void onRetry()}
          >
            <RefreshCw className="size-3" strokeWidth={1.5} />
            Retry
          </Button>
        ) : null}
      </div>
      <CollapsibleContent className="overflow-hidden text-sm transition-all duration-150 ease-out data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="bg-muted/40 relative mt-2 flex flex-col gap-2 rounded-lg p-2.5 pr-10 text-xs font-mono">
          {resultText !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 h-6 w-6 p-0"
              onClick={() => void handleCopyResult()}
              title={copied ? 'Copied' : 'Copy result'}
            >
              {copied ? (
                <Check className="size-3.5 text-foreground" strokeWidth={1.5} />
              ) : (
                <Copy className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
              )}
            </Button>
          ) : null}
          {hasInput ? (
            <pre className="whitespace-pre-wrap break-words text-xs">
              {formatValue(input)}
            </pre>
          ) : null}
          {hasOutput ? (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs opacity-90">
              {formatValue(toolPart.output)}
            </pre>
          ) : null}
          {isError && toolPart.errorText ? (
            <pre className="text-destructive max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">
              {toolPart.errorText}
            </pre>
          ) : null}
          {inFlight && !hasInput ? (
            <span className="text-muted-foreground font-sans">
              Waiting for input...
            </span>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default Tool;
