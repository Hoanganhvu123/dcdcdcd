import assert from 'node:assert/strict';

// Test safeJsonParse implementation
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

// Test transformFileUrl implementation
function transformFileUrl(url: string): string {
  try {
    if (!url.startsWith('dbgpt-fs://')) {
      return url;
    }
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'dbgpt-fs:') {
      return url;
    }
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return url;
    }
    const bucket = pathParts[0];
    const fileId = pathParts[1];
    return `/api/v2/serve/file/files/${bucket}/${fileId}${parsedUrl.search}`;
  } catch {
    return url;
  }
}

// Test formatChatContent implementation
type UserChatContent = string | {
  content?: Array<{
    type: string;
    text?: string;
    image_url?: { url?: string; fileName?: string };
    video?: string;
  }>;
};

function formatChatContent(content: UserChatContent): string {
  if (typeof content === 'string') {
    return content;
  }
  const contentItems = content?.content || [];
  const textItems = contentItems.filter(item => item.type === 'text');
  const mediaItems = contentItems.filter(item => item.type !== 'text');

  let formattedDisplayContent = '';
  if (textItems.length > 0) {
    formattedDisplayContent = textItems.map(item => item.text).join(' ');
  }

  const mediaMarkdown = mediaItems
    .map(item => {
      if (item.type === 'image_url') {
        const originalUrl = item.image_url?.url || '';
        const displayUrl = transformFileUrl(originalUrl);
        const fileName = item.image_url?.fileName || 'image';
        return `\n![${fileName}](${displayUrl})`;
      } else if (item.type === 'video') {
        const originalUrl = item.video || '';
        const displayUrl = transformFileUrl(originalUrl);
        return `\n[Video](${displayUrl})`;
      } else {
        return `\n[${item.type} attachment]`;
      }
    })
    .join('\n');

  if (mediaMarkdown) {
    formattedDisplayContent = formattedDisplayContent ? `${formattedDisplayContent}\n${mediaMarkdown}` : mediaMarkdown;
  }

  return formattedDisplayContent;
}

console.log('=== STARTING MILESTONE 3 ARCHITECTURE & SAFETY CHECKS ===');

// 1. safeJsonParse Unit Tests
console.log('\n--- SUITE 1: safeJsonParse Defensive Behavior ---');

// 1.1 Valid JSON objects
const validObj = safeJsonParse('{"name": "DB-GPT", "version": 3}', { name: 'default' });
assert.deepStrictEqual(validObj, { name: 'DB-GPT', version: 3 });
console.log('  [PASS] 1.1: Valid JSON object parsed successfully');

// 1.2 Valid JSON arrays
const validArr = safeJsonParse('[1, 2, 3]', []);
assert.deepStrictEqual(validArr, [1, 2, 3]);
console.log('  [PASS] 1.2: Valid JSON array parsed successfully');

// 1.3 Null input fallback
const nullRes = safeJsonParse(null, { fallback: true });
assert.deepStrictEqual(nullRes, { fallback: true });
console.log('  [PASS] 1.3: Null input safely returns fallback');

// 1.4 Undefined input fallback
const undefRes = safeJsonParse(undefined, 'default-string');
assert.strictEqual(undefRes, 'default-string');
console.log('  [PASS] 1.4: Undefined input safely returns fallback');

// 1.5 Empty string input fallback (fatal crash prevention)
const emptyRes = safeJsonParse('', { empty: true });
assert.deepStrictEqual(emptyRes, { empty: true });
console.log('  [PASS] 1.5: Empty string input safely returns fallback');

// 1.6 Whitespace string input fallback
const wsRes = safeJsonParse('   \n\t  ', 42);
assert.strictEqual(wsRes, 42);
console.log('  [PASS] 1.6: Whitespace string input safely returns fallback');

// 1.7 Malformed JSON syntax fallback (fatal crash prevention)
const malformedRes = safeJsonParse('{"broken": json...}', null);
assert.strictEqual(malformedRes, null);
console.log('  [PASS] 1.7: Malformed JSON syntax gracefully falls back without throwing');

// 1.8 Non-string type coercion safety
const numRes = safeJsonParse(123 as unknown as string, 'fallback');
assert.strictEqual(numRes, 'fallback');
console.log('  [PASS] 1.8: Non-string input safely returns fallback');

// 2. formatChatContent Multi-Modal Parsing Tests
console.log('\n--- SUITE 2: formatChatContent Multimodal Formatting ---');

// 2.1 Plain string content
const plainStr = formatChatContent('Hello DB-GPT');
assert.strictEqual(plainStr, 'Hello DB-GPT');
console.log('  [PASS] 2.1: Plain string pass-through');

// 2.2 Structured content with text items
const structuredText = formatChatContent({
  content: [
    { type: 'text', text: 'Analyze' },
    { type: 'text', text: 'this query' },
  ],
});
assert.strictEqual(structuredText, 'Analyze this query');
console.log('  [PASS] 2.2: Structured text array concatenation');

// 2.3 Structured content with multimodal image attachments
const structuredMedia = formatChatContent({
  content: [
    { type: 'text', text: 'Check diagram' },
    { type: 'image_url', image_url: { url: 'https://example.com/chart.png', fileName: 'architecture' } },
  ],
});
assert.ok(structuredMedia.includes('Check diagram'));
assert.ok(structuredMedia.includes('![architecture](https://example.com/chart.png)'));
console.log('  [PASS] 2.3: Multimodal image markdown formatting');

// 2.4 Structured content with video attachments
const structuredVideo = formatChatContent({
  content: [
    { type: 'video', video: 'https://example.com/demo.mp4' },
  ],
});
assert.ok(structuredVideo.includes('[Video](https://example.com/demo.mp4)'));
console.log('  [PASS] 2.4: Multimodal video markdown formatting');

console.log('\n=== ALL M3 ARCHITECTURE & SAFETY CHECKS PASSED ===\n');
