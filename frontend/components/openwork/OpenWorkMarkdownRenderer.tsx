import React, { useMemo } from 'react';
import { GPTVis } from '@antv/gpt-vis';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { preprocessLaTeX } from './services/latex';
import { OpenWorkCodeBlock } from './OpenWorkCodeBlock';
import { isSafeUrl } from '@/lib/security/sanitizer';
import {
  FileText,
  FileSpreadsheet,
  Layers,
  Code2,
  Database,
  ExternalLink,
  File,
} from 'lucide-react';
import 'katex/dist/katex.min.css';

const INLINE_CODE_FILE_EXTENSIONS = new Set([
  'astro', 'bash', 'c', 'cc', 'cpp', 'cs', 'css', 'csv', 'dart', 'docx', 'doc', 'ex', 'exs',
  'gif', 'go', 'graphql', 'h', 'hpp', 'htm', 'html', 'java', 'jpeg', 'jpg', 'js', 'json',
  'jsonc', 'jsx', 'key', 'kt', 'kts', 'log', 'lua', 'markdown', 'md', 'mdx', 'mjs', 'cjs',
  'odp', 'ods', 'pdf', 'php', 'png', 'pot', 'potx', 'ppt', 'pptm', 'pptx', 'prisma', 'py',
  'rb', 'rs', 'scss', 'sh', 'sql', 'svelte', 'svg', 'swift', 'toml', 'ts', 'tsv', 'tsx',
  'txt', 'vue', 'webp', 'xls', 'xlsx', 'xml', 'yaml', 'yml', 'zig'
]);

const INLINE_CODE_LINE_SUFFIX = /(?::\d+(?::\d+)?|#L\d+(?:-L?\d+)?)$/i;

export function inlineCodeArtifactPath(value: string): string | null {
  const trimmed = (value || '').trim();
  const path = trimmed.replace(INLINE_CODE_LINE_SUFFIX, '');

  if (
    !path ||
    path.length > 500 ||
    /[\u0000-\u001f<>"'`|?*]/.test(path) ||
    /^(?:https?|wss?|ftp|mailto|tel|file):/i.test(path)
  ) {
    return null;
  }

  const normalized = path.replace(/[\\]+/g, '/');
  const withoutDrive = normalized.replace(/^[A-Za-z]:\//, '/');
  if (withoutDrive.slice(1).includes(':')) return null;

  const segments = withoutDrive.split('/').filter(Boolean);
  const filename = segments[segments.length - 1];
  if (!filename || segments.some((segment) => segment === '.' || segment === '..')) return null;

  const extensionIndex = filename.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex + 1).toLowerCase() : '';
  return INLINE_CODE_FILE_EXTENSIONS.has(extension) ? path : null;
}

function resolveInlineFileIcon(path: string) {
  const filename = path.split('/').pop() || path;
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1).toLowerCase() : '';

  if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) return FileSpreadsheet;
  if (['pptx', 'ppt', 'key', 'odp'].includes(ext)) return Layers;
  if (['docx', 'doc', 'pdf', 'md', 'markdown', 'txt'].includes(ext)) return FileText;
  if (['sql', 'prisma'].includes(ext)) return Database;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'cpp', 'c', 'java', 'html', 'css', 'json', 'yaml', 'yml', 'sh', 'bash'].includes(ext)) return Code2;
  return File;
}

export interface OpenWorkMarkdownRendererProps {
  content: string;
  className?: string;
  onArtifactClick?: (path: string) => void;
}

/**
 * Custom HAST security sanitizer plugin that strips dangerous HTML elements,
 * event handlers, unsafe link schemes, and malicious inline style injections.
 */
function rehypeSecuritySanitize() {
  return (tree: any) => {
    function sanitizeNode(node: any, parent: any, index: number): boolean {
      if (!node) return true;

      if (node.type === 'element') {
        const tag = (node.tagName || '').toLowerCase();
        // Disallow dangerous and executable tags
        if (
          ['script', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'base', 'form', 'input', 'button', 'style'].includes(tag)
        ) {
          if (parent && Array.isArray(parent.children)) {
            parent.children.splice(index, 1);
            return false;
          }
        }

        if (node.properties) {
          for (const key of Object.keys(node.properties)) {
            // Strip any on* event handler attributes
            if (/^on[a-zA-Z]/i.test(key)) {
              delete node.properties[key];
            }
          }

          // Validate href attributes on any element
          if (node.properties.href && typeof node.properties.href === 'string') {
            if (!isSafeUrl(node.properties.href)) {
              node.properties.href = '#';
            }
          }

          // Validate src attributes on any element
          if (node.properties.src && typeof node.properties.src === 'string') {
            if (!isSafeUrl(node.properties.src)) {
              delete node.properties.src;
            }
          }

          // Validate inline styles against CSS injection
          if (typeof node.properties.style === 'string') {
            if (/(?:expression|javascript|url|behavior|import|-moz-binding|<|>)/i.test(node.properties.style)) {
              delete node.properties.style;
            }
          }
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          sanitizeNode(node.children[i], node, i);
        }
      }

      return true;
    }

    sanitizeNode(tree, null, 0);
  };
}

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any;
const rehypePlugins = [
  rehypeRaw,
  rehypeSecuritySanitize,
  [
    rehypeKatex,
    {
      output: 'htmlAndMathml',
      trust: false,
      strict: 'warn',
      maxSize: 500,
      maxExpand: 1000,
    },
  ],
] as any;

export const OpenWorkMarkdownRenderer: React.FC<OpenWorkMarkdownRendererProps> = ({
  content,
  className = '',
  onArtifactClick,
}) => {
  const processed = useMemo(() => preprocessLaTeX(content || ''), [content]);

  const components = useMemo(
    () => ({
      code: ({ inline, className: codeClass, children }: any) => {
        const text = String(children || '').replace(/\n$/, '');
        const match = /language-([\w:-]+)/.exec(codeClass || '');
        const isBlock = !inline && (match || text.includes('\n'));

        if (isBlock) {
          return <OpenWorkCodeBlock code={text} language={match ? match[1] : 'text'} />;
        }

        const filePath = inlineCodeArtifactPath(text);
        if (filePath) {
          const FileIcon = resolveInlineFileIcon(filePath);
          return (
            <span
              data-openwork-inline-code-path={filePath}
              role="button"
              tabIndex={0}
              onClick={() => onArtifactClick?.(filePath)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onArtifactClick?.(filePath);
                }
              }}
              title={`Mở artifact: ${filePath}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/80 bg-muted/50 text-xs font-mono font-medium text-foreground hover:bg-accent hover:border-border cursor-pointer transition-colors select-none align-middle shadow-xs my-0.5"
            >
              <FileIcon size={13} className="text-foreground shrink-0" />
              <span>{text}</span>
              <span className="text-muted-foreground text-[0.6875rem] ml-0.5">↗</span>
            </span>
          );
        }

        return (
          <code className="rounded-md bg-muted/70 border border-border/40 px-1.5 py-0.5 font-mono text-xs text-foreground">
            {children}
          </code>
        );
      },
      a: ({ href, children, ...rest }: any) => {
        const safeHref = isSafeUrl(href) ? href : '#';
        const isExternal = /^https?:\/\//i.test(safeHref);
        return (
          <a
            href={safeHref}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noreferrer noopener' : undefined}
            className="text-foreground underline decoration-border hover:decoration-foreground font-medium transition-colors inline-flex items-center gap-0.5"
            {...rest}
          >
            <span>{children}</span>
            {isExternal && <ExternalLink size={11} className="shrink-0 text-muted-foreground" />}
          </a>
        );
      },
    }),
    [onArtifactClick]
  );

  return (
    <div className={`ow-md ${className}`.trim()}>
      <GPTVis
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processed}
      </GPTVis>
    </div>
  );
};
