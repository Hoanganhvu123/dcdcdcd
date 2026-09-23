/**
 * Preprocess LaTeX syntax, convert \[ \] and \( \) to $$ $$ and $ $
 * Also handle some common edge cases
 * @param content
 */
export function preprocessLaTeX(content: any): string {
  if (typeof content !== 'string') {
    return content;
  }
  // Extract code blocks
  const codeBlocks: string[] = [];
  content = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match: string) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Protect currency amounts ($100, $2,450,000, $360,000) from being treated as LaTeX delimiters
  content = content.replace(/\$(?=\d)/g, '&#36;');

  // Handle \[ ... \] format (display math)
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

  // Handle \( ... \) format (inline math)
  content = content.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');

  // Restore code blocks
  content = content.replace(/__CODE_BLOCK_(\d+)__/g, (_: string, index: string) => {
    return codeBlocks[parseInt(index, 10)];
  });

  return content;
}
