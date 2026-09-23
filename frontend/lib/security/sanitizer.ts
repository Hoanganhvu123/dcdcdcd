import DOMPurify from 'dompurify';

/**
 * Validates whether a URL is safe to render in <a href>, <iframe>, or redirect targets.
 * Strictly permits: http:, https:, mailto:, tel:, and relative paths (/ , ./ , ../ , # , ?).
 * Strictly rejects: javascript:, vbscript:, data:, file:, blob:, and encoded / obfuscated variants.
 */
export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;

  // Strip leading/trailing whitespaces and ASCII control characters (0-31, 127)
  const trimmed = url.replace(/[\u0000-\u001f\u007f\s]+/g, '').trim();
  if (!trimmed) return false;

  // Check for common HTML entity encoded javascript / vbscript / data / file / blob
  const decoded = trimmed
    .replace(/&#x?0*([0-9a-f]+);?/gi, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 16));
      } catch {
        return '';
      }
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '')
    .replace(/&newline;/gi, '');

  // Strip invisible characters and whitespace again after entity decode
  const normalized = decoded.replace(/[\u0000-\u001f\u007f\s]+/g, '');

  // Explicit dangerous schemes check
  if (/^(?:javascript|vbscript|data|file|blob):/i.test(normalized)) {
    return false;
  }

  // If URL has a scheme (starts with <alpha><alphanumeric+.-*>:)
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(normalized);
  if (schemeMatch) {
    const scheme = schemeMatch[0].toLowerCase();
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(scheme);
  }

  // For relative URLs or protocol-relative (//)
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('#') ||
    normalized.startsWith('?')
  ) {
    return true;
  }

  // If there is no scheme and no colon anywhere before first slash/query/hash, it is a safe relative path
  const firstColon = normalized.indexOf(':');
  const firstSlash = normalized.indexOf('/');
  const firstQuestion = normalized.indexOf('?');
  const firstHash = normalized.indexOf('#');

  const delimiterIndex = Math.min(
    firstSlash === -1 ? Infinity : firstSlash,
    firstQuestion === -1 ? Infinity : firstQuestion,
    firstHash === -1 ? Infinity : firstHash
  );

  if (firstColon !== -1 && firstColon < delimiterIndex) {
    // Unrecognized scheme like `custom-scheme:payload`
    return false;
  }

  return true;
}

let purifyInstance: any = null;

function getPurify() {
  if (purifyInstance) return purifyInstance;
  if (typeof window !== 'undefined') {
    if (typeof (DOMPurify as any).sanitize === 'function') {
      purifyInstance = DOMPurify;
    } else if (typeof DOMPurify === 'function') {
      purifyInstance = (DOMPurify as any)(window);
    }
  }
  return purifyInstance;
}

/**
 * Sanitizes arbitrary HTML string using DOMPurify (with robust SSR/Node fallback).
 * Neutralizes scripts, event handlers, frames, and dangerous links.
 */
export function sanitizeHtml(dirty: string, options?: any): string {
  if (!dirty || typeof dirty !== 'string') return '';

  const purify = getPurify();
  if (purify && typeof purify.sanitize === 'function') {
    return purify.sanitize(dirty, {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      ADD_ATTR: ['target', 'rel', 'class', 'style', 'aria-label', 'aria-hidden'],
      ...options,
    });
  }

  // Isomorphic SSR / Node fallback
  const sanitized = dirty
    // Remove script tags and contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and contents
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove dangerous object/embed/iframe/meta/link/applet/form
    .replace(/<\/?(?:iframe|object|embed|applet|meta|link|base|form|input|button)\b[^>]*>/gi, '')
    // Remove event handlers like onload, onerror, onclick, etc.
    .replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Neutralize javascript: / vbscript: / data: in href/src/xlink:href with double quotes
    .replace(/\s+(?:[a-zA-Z0-9_-]+:)?(?:href|src|action|formaction)\s*=\s*"(?:[^"\\]|\\.)*"/gi, (match) => {
      if (/javascript:|vbscript:|data:/i.test(match.replace(/[\s\u0000-\u001f\u007f]+/g, ''))) {
        return ' href="#"';
      }
      return match;
    })
    // Neutralize javascript: / vbscript: / data: in href/src/xlink:href with single quotes
    .replace(/\s+(?:[a-zA-Z0-9_-]+:)?(?:href|src|action|formaction)\s*=\s*'(?:[^'\\]|\\.)*'/gi, (match) => {
      if (/javascript:|vbscript:|data:/i.test(match.replace(/[\s\u0000-\u001f\u007f]+/g, ''))) {
        return ' href="#"';
      }
      return match;
    })
    // Neutralize unquoted javascript: / vbscript: / data:
    .replace(/\s+(?:[a-zA-Z0-9_-]+:)?(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, ' href="#"');

  return sanitized;
}

/**
 * Sanitizes CSS property values to prevent stylesheet injection or style tag breakout.
 */
export function sanitizeCssValue(val?: string | null): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  // Reject strings containing style breakout or injection characters
  if (/[<>{};"'\\]/.test(trimmed)) return '';
  if (/(?:expression|javascript|url|behavior|import|-moz-binding)/i.test(trimmed)) return '';
  return trimmed;
}

/**
 * Strictly sanitizes CSS color values (hex, rgb, hsl, CSS var, named colors).
 */
export function sanitizeCssColor(color?: string | null): string {
  if (!color || typeof color !== 'string') return '';
  const cleaned = sanitizeCssValue(color);
  if (!cleaned) return '';
  const isColor =
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(cleaned) ||
    /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.%\s,/+-]+\s*\)$/i.test(cleaned) ||
    /^var\(--[a-zA-Z0-9_-]+\)$/.test(cleaned) ||
    /^[a-zA-Z]{3,20}$/.test(cleaned);
  return isColor ? cleaned : '';
}

/**
 * Escapes special HTML characters to prevent XSS in text interpolations.
 */
export function escapeHtml(str?: string | null): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
