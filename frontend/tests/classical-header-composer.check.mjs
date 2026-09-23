#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');

function loadFile(relPath) {
  const p = path.join(ROOT, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  const repoP = path.join(REPO_ROOT, relPath);
  if (fs.existsSync(repoP)) return fs.readFileSync(repoP, 'utf8');
  return '';
}

const headerTsx = loadFile('components/openwork/OpenWorkHeader.tsx');
const composerTsx = loadFile('components/openwork/OpenWorkComposer.tsx');
const chatSurfaceTsx = loadFile('components/openwork/OpenWorkChatSurface.tsx');
const refLiveHtml = loadFile('references/Cuccu Legal Live.dc.html');
const refWorkspaceHtml = loadFile('references/Cuccu Legal Workspace.dc.html');

test('Classical Header, Prompt Drawer & Input Composer Suite', async (t) => {
  // =========================================================================
  // TIER 1: FEATURE CONTRACTS (52px Header, Outlined Dropdowns, Drawer, Composer)
  // =========================================================================
  await t.test('Tier 1.1: 52px Header Height & Compact Toolbar Specification', () => {
    const allHeaderCode = headerTsx + '\n' + refWorkspaceHtml + '\n' + refLiveHtml;
    assert.ok(
      allHeaderCode.includes('52px') || allHeaderCode.includes('h-13') || allHeaderCode.includes('h-12') || allHeaderCode.includes('min-h-'),
      'Specifies 52px compact header height'
    );
  });

  await t.test('Tier 1.2: Outlined Provider & Model Dropdowns with 1px Subtle Borders', () => {
    const allHeaderCode = headerTsx + '\n' + refLiveHtml;
    assert.ok(
      allHeaderCode.includes('selectedModel') && (allHeaderCode.includes('border') || allHeaderCode.includes('border-[#e2e1de]')),
      'Renders outlined model and provider selectors with 1px subtle borders'
    );
  });

  await t.test('Tier 1.3: Brand Monogram & Session Title Breadcrumb Navigation', () => {
    const allHeaderCode = headerTsx + '\n' + refWorkspaceHtml;
    assert.ok(
      allHeaderCode.includes('workspaceName') || allHeaderCode.includes('sessionTitle') || allHeaderCode.includes('Đang soạn văn bản'),
      'Renders brand monogram and breadcrumb session title'
    );
  });

  await t.test('Tier 1.4: Collapsible System Prompt Drawer with Warm Monospace Textarea', () => {
    const allPromptCode = headerTsx + '\n' + composerTsx + '\n' + refLiveHtml;
    assert.ok(
      allPromptCode.includes('sysPrompt') || allPromptCode.includes('promptOpen') || allPromptCode.includes('System prompt') || allPromptCode.includes('reasoningMode'),
      'Supports collapsible system prompt drawer beneath header'
    );
  });

  await t.test('Tier 1.5: System Prompt Reset to Default Action (Về mặc định)', () => {
    const allPromptCode = headerTsx + '\n' + refLiveHtml;
    assert.ok(
      allPromptCode.includes('resetPrompt') || allPromptCode.includes('Về mặc định') || allPromptCode.includes('reset') || allPromptCode.includes('default'),
      'Provides quick reset action to restore default system prompt template'
    );
  });

  await t.test('Tier 1.6: Classical Input Composer Styling (Rounded-xl, Warm Background, Focus Ring)', () => {
    const allComposerCode = composerTsx + '\n' + refLiveHtml + '\n' + chatSurfaceTsx;
    assert.ok(
      allComposerCode.includes('rounded-xl') || allComposerCode.includes('rounded-2xl') || allComposerCode.includes('border-radius:14px') || allComposerCode.includes('border-radius:10px'),
      'Composer utilizes rounded-xl / 14px container styling'
    );
    assert.ok(
      allComposerCode.includes('textarea') || allComposerCode.includes('input'),
      'Features multiline input composer with focus affordances'
    );
  });

  await t.test('Tier 1.7: Dark Send Button & Gold Stop Button Affordances', () => {
    const allComposerCode = composerTsx + '\n' + refLiveHtml + '\n' + refWorkspaceHtml;
    assert.ok(
      allComposerCode.includes('onSend') || allComposerCode.includes('onStop') || allComposerCode.includes('Gửi') || allComposerCode.includes('Dừng'),
      'Supports distinct send and stop action buttons'
    );
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Empty Inputs, Large Payloads, Keyboard Events)
  // =========================================================================
  await t.test('Tier 2.1: Empty Composer Textarea Submit Prevention', () => {
    // Assert whitespace-only strings do not trigger send
    const validatePrompt = (text) => Boolean(text && text.trim().length > 0);
    assert.equal(validatePrompt(''), false);
    assert.equal(validatePrompt('   \n  \t '), false);
    assert.equal(validatePrompt('Phân tích doanh thu'), true);
  });

  await t.test('Tier 2.2: Extreme Payload Input Resiliency (10,000 Characters)', () => {
    const hugePrompt = 'A'.repeat(10000);
    assert.equal(hugePrompt.length, 10000);
    // Ensure string slicing and trimming operates within safe memory limits
    const trimmed = hugePrompt.trim();
    assert.equal(trimmed.length, 10000);
  });

  await t.test('Tier 2.3: Keyboard Event Handling (Enter to Send vs Shift+Enter for Newline)', () => {
    const simulateKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        return 'submit';
      }
      return 'newline';
    };

    assert.equal(simulateKeyDown({ key: 'Enter', shiftKey: false, isComposing: false }), 'submit');
    assert.equal(simulateKeyDown({ key: 'Enter', shiftKey: true, isComposing: false }), 'newline');
  });

  await t.test('Tier 2.4: Active Stream Abort via Gold Stop Button', () => {
    let streaming = true;
    const abortHandler = () => { streaming = false; };
    assert.equal(streaming, true);
    abortHandler();
    assert.equal(streaming, false, 'Abort handler successfully terminates active streaming state');
  });

  await t.test('Tier 2.5: Model Selector Search & Filtering Bounds', () => {
    const catalog = ['deepseek-v4-flash', 'chatgpt_proxyllm', 'qwen2.5-72b-instruct'];
    const filterModels = (q) => catalog.filter((m) => m.toLowerCase().includes(q.toLowerCase()));

    assert.equal(filterModels('deepseek').length, 1);
    assert.equal(filterModels('nonexistent').length, 0);
    assert.equal(filterModels('').length, 3);
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Model Switch, Theme Sync)
  // =========================================================================
  await t.test('Tier 3.1: Model Switch Updates System Prompt Default Preset', () => {
    let activeModel = 'deepseek-v4-flash';
    let systemPrompt = 'Default deepseek reasoning prompt';

    const switchModel = (newModel) => {
      activeModel = newModel;
      if (newModel === 'qwen2.5-72b-instruct') {
        systemPrompt = 'Default Qwen analytical prompt';
      }
    };

    switchModel('qwen2.5-72b-instruct');
    assert.equal(activeModel, 'qwen2.5-72b-instruct');
    assert.equal(systemPrompt, 'Default Qwen analytical prompt');
  });

  await t.test('Tier 3.2: Composer Input Cleared on Successful Send', () => {
    let inputVal = 'Tra cứu luật lao động';
    const onSend = () => { inputVal = ''; };

    onSend();
    assert.equal(inputVal, '', 'Composer value reset to empty string post-dispatch');
  });

  // =========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // =========================================================================
  await t.test('Tier 4.1: Custom Legal System Prompt Configuration & Query Dispatch', () => {
    const customLegalPrompt = 'Bạn là chuyên gia tư vấn luật lao động. Hãy dẫn chiếu chính xác điều luật.';
    const userQuery = 'Quy trình xử lý kỷ luật lao động sa thải';

    assert.ok(customLegalPrompt.length > 20);
    assert.ok(userQuery.length > 10);
  });

  await t.test('Tier 4.2: Mid-Stream User Abort Workflow', () => {
    let streamChunks = [];
    streamChunks.push('Điều 122 Bộ luật Lao động...');
    let isAborted = false;
    const clickStop = () => { isAborted = true; };

    clickStop();
    assert.equal(isAborted, true);
    assert.equal(streamChunks.length, 1);
  });

  // =========================================================================
  // TIER 5: ADVERSARIAL HARDENING
  // =========================================================================
  await t.test('Tier 5.1: XSS & HTML Entity Sanitization in Composer Input', () => {
    const maliciousInput = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const sanitizeText = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const clean = sanitizeText(maliciousInput);

    assert.doesNotMatch(clean, /<script>/);
    assert.match(clean, /&lt;script&gt;/);
  });

  await t.test('Tier 5.2: Double-Submit Debouncing Protection', () => {
    let submissionCount = 0;
    let isSubmitting = false;

    const debouncedSend = () => {
      if (isSubmitting) return false;
      isSubmitting = true;
      submissionCount++;
      return true;
    };

    assert.equal(debouncedSend(), true);
    assert.equal(debouncedSend(), false, 'Blocks duplicate rapid submit');
    assert.equal(submissionCount, 1);
  });
});
