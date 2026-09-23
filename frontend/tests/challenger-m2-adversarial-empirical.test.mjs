import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// TARGET IMPLEMENTATION EXTRACTION & MIRRORING
// ============================================================================

/**
 * Extracted directly from frontend_mock/components/openwork/useOpenWorkStore.ts
 */
export function resolveToolMeta(toolName) {
  const lower = (toolName || '').toLowerCase();
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) {
    return { tab: 'slide', extension: '.pptx', defaultName: 'presentation.pptx', defaultTitle: 'Bài Thuyết Trình Slide (16:9)' };
  }
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) {
    return { tab: 'excel', extension: '.xlsx', defaultName: 'spreadsheet.xlsx', defaultTitle: 'Bảng Tính Excel' };
  }
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) {
    return { tab: 'docx', extension: '.docx', defaultName: 'document.docx', defaultTitle: 'Tài Liệu Báo Cáo DOCX' };
  }
  return { tab: 'code', extension: '.py', defaultName: 'pipeline.py', defaultTitle: 'Mã Nguồn Thực Thi' };
}

export function parsePartialJson(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    let repaired = trimmed;
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    const stack = [];
    let inString = false;
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
    }
    while (stack.length > 0) {
      repaired += stack.pop();
    }
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

// Simulated Store State Machine matching useOpenWorkStore
class OpenWorkStoreSimulator {
  constructor() {
    this.artifacts = [];
    this.activeTab = 'excel';
    this.workbenchOpen = false;
    this.activeArtifactId = '';
    this.spotlightActive = false;
    this.isStreaming = false;
    this.streamParts = [];
  }

  onToolCallDelta(toolCall) {
    this.spotlightActive = true;
    this.isStreaming = true;
    const meta = resolveToolMeta(toolCall.name);
    const parsedContent = parsePartialJson(toolCall.accumulatedArguments);

    const artId = toolCall.id || `art-${meta.tab}-${toolCall.index}`;
    const currentTitle = parsedContent?.title || meta.defaultTitle;
    const currentName = parsedContent?.title
      ? `${String(parsedContent.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
      : meta.defaultName;

    const idx = this.artifacts.findIndex((a) => a.id === artId || a.type === meta.tab);
    const generatingArtifact = {
      id: artId,
      name: currentName,
      title: currentTitle,
      type: meta.tab,
      extension: meta.extension,
      status: 'generating',
      version: idx >= 0 ? this.artifacts[idx].version : 1,
      content: parsedContent || (idx >= 0 ? this.artifacts[idx].content : {}),
      updatedAt: 'Đang tạo...',
    };

    if (idx >= 0) {
      this.artifacts[idx] = generatingArtifact;
    } else {
      this.artifacts.push(generatingArtifact);
    }

    this.activeTab = meta.tab;
    this.workbenchOpen = true;
    this.activeArtifactId = artId;
  }

  onFinish(result) {
    if (result && Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        const toolName = tc.function?.name || tc.name;
        const meta = resolveToolMeta(toolName);
        let parsedArgs = null;
        try {
          parsedArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          parsedArgs = parsePartialJson(tc.function?.arguments || '') || {};
        }

        const artId = tc.id || `art-${meta.tab}-${tc.index ?? Date.now()}`;
        const finalTitle = parsedArgs?.title || meta.defaultTitle;
        const finalName = parsedArgs?.title
          ? `${String(parsedArgs.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
          : meta.defaultName;

        const idx = this.artifacts.findIndex((a) => a.id === artId || a.type === meta.tab);
        const readyArtifact = {
          id: artId,
          name: finalName,
          title: finalTitle,
          type: meta.tab,
          extension: meta.extension,
          status: 'ready',
          version: idx >= 0 ? this.artifacts[idx].version + 1 : 1,
          content: parsedArgs,
          updatedAt: 'Vừa xong',
        };

        if (idx >= 0) {
          this.artifacts[idx] = readyArtifact;
        } else {
          this.artifacts.push(readyArtifact);
        }

        this.activeTab = meta.tab;
        this.activeArtifactId = artId;
      }
    }
    this.spotlightActive = false;
    this.isStreaming = false;
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

test('🔥 EMPIRICAL ADVERSARIAL CHALLENGER: MILESTONE 2 (R2)', async (t) => {

  await t.test('1. `parsePartialJson` Extreme Malformed & Fragmented Fuzzing Matrix', (t2) => {
    const edgeCases = [
      { input: '', expectedNull: true, desc: 'Empty string' },
      { input: '   \n\t  ', expectedNull: true, desc: 'Whitespace only' },
      { input: 'null', expectedVal: null, desc: 'Literal null' },
      { input: 'true', expectedVal: true, desc: 'Literal true' },
      { input: '12345', expectedVal: 12345, desc: 'Literal integer' },
      { input: '{"title": "Hello', expectedObj: { title: 'Hello' }, desc: 'Unclosed string property value' },
      { input: '{"title": "Hello World", "themeVars": {"--osd-accent": "#ff0000', expectedObj: { title: 'Hello World', themeVars: { '--osd-accent': '#ff0000' } }, desc: 'Nested object unclosed string' },
      { input: '{"slides": [{"layout": "hero", "title": "Slide 1"}, {"layout": "stats"', expectedObj: { slides: [{ layout: 'hero', title: 'Slide 1' }, { layout: 'stats' }] }, desc: 'Array of objects cut after second object key-value' },
      { input: '{"text": "Quote with \\"escaped\\" quotes inside', expectedObj: { text: 'Quote with "escaped" quotes inside' }, desc: 'Escaped quotes inside unclosed string' },
      { input: '{"title": "Tiếng Việt có dấu: Chiến lược & Kế hoạch 2026 🎯', expectedObj: { title: 'Tiếng Việt có dấu: Chiến lược & Kế hoạch 2026 🎯' }, desc: 'UTF-8 Vietnamese characters & emojis' },
      { input: '{"incomplete_key": ', expectedNull: true, desc: 'Incomplete key with trailing colon' },
      { input: '{"invalid": [1, 2, ', expectedNull: true, desc: 'Incomplete array with trailing comma' },
      { input: '<div>HTML garbage</div>', expectedNull: true, desc: 'Non-JSON HTML payload' },
      { input: '<<<MALFORMED>>>', expectedNull: true, desc: 'Non-JSON symbolic noise' },
      { input: '{"a": '.repeat(30) + '1' + '}'.repeat(30), expectedVal: JSON.parse('{"a": '.repeat(30) + '1' + '}'.repeat(30)), desc: 'Deeply nested 30-level object' },
    ];

    for (const ec of edgeCases) {
      assert.doesNotThrow(() => {
        const res = parsePartialJson(ec.input);
        if (ec.expectedNull) {
          assert.equal(res, null, `Expected null for: ${ec.desc}`);
        } else if (ec.expectedObj) {
          assert.deepEqual(res, ec.expectedObj, `Expected matched object for: ${ec.desc}`);
        } else if ('expectedVal' in ec) {
          assert.deepEqual(res, ec.expectedVal, `Expected matched value for: ${ec.desc}`);
        }
      }, `Should never throw unhandled exception for: ${ec.desc}`);
    }
  });

  await t.test('2. Byte-by-Byte & Chunk Split Adversarial Stream Simulation', (t2) => {
    const fullPayload = JSON.stringify({
      title: 'Báo Cáo Toàn Diện 2026',
      themeVars: {
        '--osd-bg': '#0f172a',
        '--osd-accent': '#38bdf8',
      },
      slides: [
        { layout: 'hero', title: 'Giới Thiệu', subtitle: 'Khởi đầu mới' },
        { layout: 'stats', title: 'Chỉ Số', stats: [{ label: 'Tăng trưởng', value: '+150%' }] },
        { layout: 'grid', title: 'Tính Năng', items: ['Tốc độ', 'Bảo mật', 'Mở rộng'] },
      ],
    });

    // Simulate byte-by-byte streaming
    let accumulated = '';
    let successfullyParsedAtLeastOnce = false;

    for (let i = 0; i < fullPayload.length; i++) {
      accumulated += fullPayload[i];
      assert.doesNotThrow(() => {
        const partial = parsePartialJson(accumulated);
        if (partial && typeof partial === 'object') {
          successfullyParsedAtLeastOnce = true;
          if (partial.title) {
            assert.ok(typeof partial.title === 'string');
          }
        }
      }, `Failed at byte offset ${i}: ${accumulated.slice(-20)}`);
    }

    assert.ok(successfullyParsedAtLeastOnce, 'Should have progressively parsed valid partial JSON during stream');
    const finalResult = parsePartialJson(accumulated);
    assert.deepEqual(finalResult, JSON.parse(fullPayload), 'Final parsed JSON must match full payload identically');
  });

  await t.test('3. Multi-Tool Call Burst & Lifecycle Transition (generating -> ready)', (t2) => {
    const store = new OpenWorkStoreSimulator();

    // 1. Tool Call Delta 1: Presentation Builder
    store.onToolCallDelta({
      id: 'call-slide-101',
      index: 0,
      name: 'presentation_builder',
      accumulatedArguments: '{"title": "Live Slide Deck", "slides": [{"layout": "hero"',
    });

    assert.equal(store.spotlightActive, true, 'Spotlight must be active during tool execution');
    assert.equal(store.activeTab, 'slide', 'Active tab must switch to slide');
    assert.equal(store.activeArtifactId, 'call-slide-101');
    assert.equal(store.artifacts.length, 1);
    assert.equal(store.artifacts[0].status, 'generating');
    assert.equal(store.artifacts[0].type, 'slide');
    assert.equal(store.artifacts[0].title, 'Live Slide Deck');

    // 2. Tool Call Delta 2: Spreadsheet Studio
    store.onToolCallDelta({
      id: 'call-excel-102',
      index: 1,
      name: 'spreadsheet_studio',
      accumulatedArguments: '{"title": "Financial Forecast 2026", "sheets": [{"name": "PnL"',
    });

    assert.equal(store.activeTab, 'excel', 'Active tab must switch to excel on new tool call');
    assert.equal(store.activeArtifactId, 'call-excel-102');
    assert.equal(store.artifacts.length, 2);
    assert.equal(store.artifacts[1].status, 'generating');
    assert.equal(store.artifacts[1].type, 'excel');
    assert.equal(store.artifacts[1].title, 'Financial Forecast 2026');

    // 3. Tool Call Delta 3: Doc Writer
    store.onToolCallDelta({
      id: 'call-docx-103',
      index: 2,
      name: 'doc_writer',
      accumulatedArguments: '{"title": "Executive Strategic Memo", "sections": [',
    });

    assert.equal(store.activeTab, 'docx', 'Active tab must switch to docx');
    assert.equal(store.activeArtifactId, 'call-docx-103');
    assert.equal(store.artifacts.length, 3);
    assert.equal(store.artifacts[2].status, 'generating');
    assert.equal(store.artifacts[2].type, 'docx');
    assert.equal(store.artifacts[2].title, 'Executive Strategic Memo');

    // 4. Stream Finish with complete tool calls payload
    store.onFinish({
      reasoning: 'Detailed thoughts...',
      content: 'Generated 3 artifacts.',
      toolCalls: [
        {
          id: 'call-slide-101',
          name: 'presentation_builder',
          function: {
            name: 'presentation_builder',
            arguments: JSON.stringify({
              title: 'Live Slide Deck',
              slides: [{ layout: 'hero', title: 'Welcome' }, { layout: 'stats', title: 'Growth' }],
            }),
          },
        },
        {
          id: 'call-excel-102',
          name: 'spreadsheet_studio',
          function: {
            name: 'spreadsheet_studio',
            arguments: JSON.stringify({
              title: 'Financial Forecast 2026',
              sheets: [{ name: 'PnL', rows: [['Revenue', '$10M']] }],
            }),
          },
        },
        {
          id: 'call-docx-103',
          name: 'doc_writer',
          function: {
            name: 'doc_writer',
            arguments: JSON.stringify({
              title: 'Executive Strategic Memo',
              markdown: '# Executive Summary\nStrategic goals...',
            }),
          },
        },
      ],
    });

    assert.equal(store.spotlightActive, false, 'Spotlight must deactivate upon stream completion');
    assert.equal(store.isStreaming, false, 'isStreaming must be false');
    assert.equal(store.artifacts.length, 3, 'All 3 artifacts must be retained in store');

    for (const art of store.artifacts) {
      assert.equal(art.status, 'ready', `Artifact ${art.id} must be status: ready`);
      assert.ok(art.version >= 2, `Artifact ${art.id} version must be incremented`);
      assert.ok(art.content, `Artifact ${art.id} content must be populated`);
    }

    assert.equal(store.activeTab, 'docx', 'Active tab matches last toolCall in batch');
    assert.equal(store.activeArtifactId, 'call-docx-103');
  });

  await t.test('4. Zero Static Mock Templates Invariant Across frontend and frontend_mock', () => {
    const projectRoot = ROOT.endsWith('frontend_mock') || ROOT.endsWith('frontend') ? path.resolve(ROOT, '..') : ROOT;
    const dirsToCheck = [
      path.join(projectRoot, 'frontend'),
      path.join(projectRoot, 'frontend_mock'),
    ];

    const forbiddenKeywords = ['mockSlideTemplates', 'mockReplaySessions'];

    function searchDir(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'tests' || entry.name === '__tests__') continue;
          searchDir(fullPath);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          if (fullPath === fileURLToPath(import.meta.url)) continue;
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const kw of forbiddenKeywords) {
            assert.ok(
              !content.includes(kw),
              `VIOLATION: Forbidden mock keyword "${kw}" found in ${fullPath}`
            );
          }
        }
      }
    }

    for (const d of dirsToCheck) {
      searchDir(d);
    }
  });

  await t.test('5. SlideTemplateGallery Prompt Starters Zero Static Decks Invariant', () => {
    const projectRoot = ROOT.endsWith('frontend_mock') || ROOT.endsWith('frontend') ? path.resolve(ROOT, '..') : ROOT;
    const galleryPaths = [
      path.resolve(projectRoot, 'frontend_mock/components/chat/office-slides/SlideTemplateGallery.tsx'),
      path.resolve(projectRoot, 'frontend/components/chat/office-slides/SlideTemplateGallery.tsx'),
    ];

    for (const gp of galleryPaths) {
      if (fs.existsSync(gp)) {
        const content = fs.readFileSync(gp, 'utf-8');
        assert.ok(content.includes('DYNAMIC_SLIDE_STARTERS'), `Must contain DYNAMIC_SLIDE_STARTERS in ${gp}`);
        assert.ok(content.includes('slides: []'), `Starters must have slides: [] in ${gp}`);
        assert.ok(!content.includes('mockSlideTemplates'), `Must not import or reference mockSlideTemplates in ${gp}`);
      }
    }
  });

  await t.test('6. Production Component & Store Invariant', () => {
    const frontendFiles = [
      'components/openwork/useOpenWorkStore.ts',
      'components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx',
      'components/openwork/OpenWorkWorkbench.tsx',
      'components/openwork/OpenWorkShell.tsx',
    ];

    for (const f of frontendFiles) {
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), `Production file must exist: ${f}`);
      const content = fs.readFileSync(p, 'utf-8');
      assert.ok(content.length > 50, `File ${f} must have non-empty content`);
      assert.ok(!content.includes('mockSlideTemplates'), `File ${f} must not contain mockSlideTemplates`);
    }
  });
});
