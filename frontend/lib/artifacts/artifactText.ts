/**
 * Artifact -> plain text.
 *
 * A code artifact arrives wrapped: the store writes
 * `{ code: 'SELECT …', language: 'sql' }`, not the bare string. Rendering the
 * envelope with JSON.stringify shows the user `{"code":"SELECT …"}` in a code
 * pane and copies that to their clipboard. One reader, used by every surface
 * that shows or exports artifact text, so the three of them cannot disagree.
 */

const TEXT_KEYS = ['code', 'source', 'script', 'sql', 'query', 'text', 'content'] as const;

/** @returns the payload's own text, or a readable JSON dump when it has none. */
export function artifactText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content !== 'object') return String(content);

  const obj = content as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
    // `{content: {code: …}}` — one envelope layer is worth unwrapping.
    if (v && typeof v === 'object' && key === 'content') {
      const inner = artifactText(v);
      if (inner) return inner;
    }
  }

  // Nothing textual in there: a spreadsheet or a deck. Show it, don't hide it.
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

/** Language hint for a code artifact, for syntax labels and file extensions. */
export function artifactLanguage(content: unknown, fallback = 'text'): string {
  if (content && typeof content === 'object') {
    const lang = (content as Record<string, unknown>).language;
    if (typeof lang === 'string' && lang.trim() !== '') return lang;
    if ('sql' in (content as object) || 'query' in (content as object)) return 'sql';
  }
  return fallback;
}
