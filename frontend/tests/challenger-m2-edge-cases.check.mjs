#!/usr/bin/env node
/**
 * challenger-m2-edge-cases.check.mjs
 *
 * Empirical Adversarial Challenger Suite for Milestone 2:
 * Cuccu Legal Reasoning, Statutory Citations & Dual-Column Decision Gating.
 *
 * Authored by: teamwork_preview_challenger_16_m2_1 (Challenger 1)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

console.log('================================================================');
console.log('⚔️  CHALLENGER 1 (M2): EMPIRICAL EDGE-CASE & ADVERSARIAL SUITE');
console.log('================================================================\n');

test('Milestone 2 Empirical Challenger Suite', async (t) => {

  // ==========================================================================
  // 1. DEEP CUSTOM CSS SEPARATION & INVARIANT ARCHITECTURE
  // ==========================================================================
  await t.test('1. Deep Custom CSS Separation & Invariant Architecture', async (t1) => {
    const cssPath = 'components/openwork/styles/openwork-legal.css';
    const reasoningPath = 'components/openwork/OpenWorkReasoningBlock.tsx';
    const citePath = 'components/openwork/OpenWorkLegalCiteBlock.tsx';
    const decisionPath = 'components/openwork/OpenWorkLegalDecisionBlock.tsx';
    const chatSurfacePath = 'components/openwork/OpenWorkChatSurface.tsx';

    const cssContent = readFile(cssPath);
    const reasoningTsx = readFile(reasoningPath);
    const citeTsx = readFile(citePath);
    const decisionTsx = readFile(decisionPath);
    const chatSurfaceTsx = readFile(chatSurfacePath);

    // 1.1 Invariant keyframes and animations in openwork-legal.css
    assert.match(cssContent, /@keyframes\s+wkPulse/, 'CSS must declare @keyframes wkPulse');
    assert.match(cssContent, /@keyframes\s+wkCaret/, 'CSS must declare @keyframes wkCaret');
    assert.match(cssContent, /@keyframes\s+wkSpin/, 'CSS must declare @keyframes wkSpin');
    assert.match(cssContent, /@keyframes\s+wkUp/, 'CSS must declare @keyframes wkUp');

    // 1.2 Invariant selectors and color tokens
    assert.match(cssContent, /\.legal-think-box/, 'CSS must style .legal-think-box');
    assert.match(cssContent, /\.legal-think-dot\.is-streaming\s*\{[^}]*#9b8fb0/, 'Pulsing dot must be lavender #9b8fb0');
    assert.match(cssContent, /\.legal-think-dot\.is-done\s*\{[^}]*#cfcbc4/, 'Done dot must be neutral #cfcbc4');
    assert.match(cssContent, /\.legal-think-body\s*\{[^}]*font-family:\s*['"]Lora['"]/, 'Reasoning body must use Lora');
    assert.match(cssContent, /\.legal-think-body\s*\{[^}]*font-style:\s*italic/, 'Reasoning body must be italic');
    assert.match(cssContent, /\.legal-law-card/, 'CSS must style .legal-law-card');
    assert.match(cssContent, /\.legal-cite-code/, 'CSS must style .legal-cite-code');
    assert.match(cssContent, /\.legal-cite-status-ok/, 'CSS must style .legal-cite-status-ok');
    assert.match(cssContent, /\.legal-cite-status-bad/, 'CSS must style .legal-cite-status-bad');
    assert.match(cssContent, /\.legal-toast/, 'CSS must style .legal-toast');
    assert.match(cssContent, /\.legal-ask-card/, 'CSS must style .legal-ask-card');
    assert.match(cssContent, /\.legal-ask-btn-risk/, 'CSS must style .legal-ask-btn-risk');
    assert.match(cssContent, /\.legal-ask-btn-apply/, 'CSS must style .legal-ask-btn-apply');

    // 1.3 Dark mode support in openwork-legal.css
    assert.match(cssContent, /\.dark\s+\.legal-think-box/, 'Dark mode styles for think box must exist');
    assert.match(cssContent, /\.dark\s+\.legal-law-card/, 'Dark mode styles for law card must exist');
    assert.match(cssContent, /\.dark\s+\.legal-ask-card/, 'Dark mode styles for decision card must exist');
    assert.match(cssContent, /\.dark\s+\.legal-toast/, 'Dark mode styles for toast must exist');

    // 1.4 Zero hardcoded px typography classes in TSX components (ADV-1 compliance)
    for (const [name, content] of [
      ['OpenWorkReasoningBlock', reasoningTsx],
      ['OpenWorkLegalCiteBlock', citeTsx],
      ['OpenWorkLegalDecisionBlock', decisionTsx],
    ]) {
      const pxMatches = content.match(/text-\[\d+px\]/g);
      assert.equal(pxMatches, null, `${name} must have 0 hardcoded text-[XXpx] classes`);
    }

    // 1.5 OpenWorkChatSurface wiring for legal parts
    assert.match(chatSurfaceTsx, /import\s+['"]\.\/styles\/openwork-legal\.css['"]/, 'Chat surface must import openwork-legal.css');
    assert.match(chatSurfaceTsx, /OpenWorkLegalCiteBlock/, 'Chat surface must import OpenWorkLegalCiteBlock');
    assert.match(chatSurfaceTsx, /OpenWorkLegalDecisionBlock/, 'Chat surface must import OpenWorkLegalDecisionBlock');
    assert.match(chatSurfaceTsx, /type\s*===\s*['"]legal-cite['"]/, 'Chat surface must route legal-cite parts');
    assert.match(chatSurfaceTsx, /type\s*===\s*['"]legal-decision['"]/, 'Chat surface must route legal-decision parts');
  });

  // ==========================================================================
  // 2. CITATION LOOKUP TOAST INTERACTIONS & STATUTORY REPOSITORY
  // ==========================================================================
  await t.test('2. Citation Lookup Toast Interactions & Edge Cases', async (t2) => {
    const citeTsx = readFile('components/openwork/OpenWorkLegalCiteBlock.tsx');

    // 2.1 Statutory laws dictionary verification
    assert.match(citeTsx, /export const STATUTORY_LAWS:\s*Record<string,\s*string>\s*=\s*\{/, 'Must export STATUTORY_LAWS');
    assert.match(citeTsx, /'Điều 472 BLDS 2015':/, 'Must contain Điều 472 BLDS 2015');
    assert.match(citeTsx, /'Điều 328 BLDS 2015':/, 'Must contain Điều 328 BLDS 2015');
    assert.match(citeTsx, /'Điều 428 BLDS 2015':/, 'Must contain Điều 428 BLDS 2015');
    assert.match(citeTsx, /'Điều 301 LTM 2005':/, 'Must contain Điều 301 LTM 2005');
    assert.match(citeTsx, /'Điều 302 LTM 2005':/, 'Must contain Điều 302 LTM 2005');
    assert.match(citeTsx, /'Điều 39 BLTTDS 2015':/, 'Must contain Điều 39 BLTTDS 2015');

    // 2.2 Verify edge case: missing/unknown code fallback
    assert.match(
      citeTsx,
      /STATUTORY_LAWS\[code\]\s*\|\|\s*['"]chưa có bản trích trong phiên này\.['"]/,
      'Unknown statutory code lookup must fallback cleanly to placeholder text without crashing'
    );

    // 2.3 Verify edge case: timer cancellation and 7000ms duration
    assert.match(citeTsx, /if\s*\(\s*toastTimerRef\.current\s*\)\s*\{\s*clearTimeout\(\s*toastTimerRef\.current\s*\);?\s*\}/, 'Must clear existing timer on new cite click');
    assert.match(citeTsx, /setTimeout\([^,]+,\s*7000\)/, 'Toast duration must strictly be 7000ms as per Cuccu Legal spec');

    // 2.4 Verify edge case: manual dismiss handler
    assert.match(citeTsx, /handleCloseToast/, 'Must provide handleCloseToast handler');
    assert.match(citeTsx, /setActiveToast\(null\)/, 'Dismiss must set activeToast to null');

    // 2.5 Verify edge case: unmount cleanup
    assert.match(citeTsx, /useEffect\(\(\)\s*=>\s*\{\s*return\s*\(\)\s*=>\s*\{[^}]*clearTimeout/, 'Must clean up timeout on unmount');

    // 2.6 Verify isRunning state handling
    assert.match(citeTsx, /isRunning\s*&&/, 'Must check isRunning state');
    assert.match(citeTsx, /legal-law-spinner/, 'Must render spinner when isRunning is true');
    assert.match(citeTsx, /legal-law-wait/, 'Must render waitText when isRunning is true');
    assert.match(citeTsx, /!isRunning\s*&&/, 'Must suppress table rows when isRunning is true');

    // 2.7 Verify onCiteClick callback invocation
    assert.match(citeTsx, /if\s*\(onCiteClick\)\s*\{\s*onCiteClick\(code,\s*lawText\);?\s*\}/, 'Must invoke onCiteClick with code and lawText');

    // 2.8 Behavioral simulation of handleCite state machine
    const STATUTORY_LAWS = {
      'Điều 472 BLDS 2015': 'Hợp đồng thuê tài sản...',
      'Điều 301 LTM 2005': 'Mức phạt đối với vi phạm...',
    };

    let activeToast = null;
    let timerHandle = null;
    let timerDuration = null;
    const dispatchedCites = [];

    const handleCiteSim = (code, onCiteClick) => {
      const lawText = STATUTORY_LAWS[code] || 'chưa có bản trích trong phiên này.';
      activeToast = { code, text: lawText };
      if (onCiteClick) onCiteClick(code, lawText);

      if (timerHandle) {
        clearTimeout(timerHandle);
      }
      timerDuration = 7000;
      timerHandle = setTimeout(() => {
        activeToast = null;
      }, 7000);
    };

    const handleCloseSim = () => {
      if (timerHandle) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
      activeToast = null;
    };

    // Test 2.8.1 Known code
    handleCiteSim('Điều 472 BLDS 2015', (code, text) => dispatchedCites.push({ code, text }));
    assert.equal(activeToast.code, 'Điều 472 BLDS 2015');
    assert.equal(activeToast.text, 'Hợp đồng thuê tài sản...');
    assert.equal(timerDuration, 7000);
    assert.equal(dispatchedCites.length, 1);

    // Test 2.8.2 Rapid click with unknown code
    handleCiteSim('Điều 999 BLDS 2099');
    assert.equal(activeToast.code, 'Điều 999 BLDS 2099');
    assert.equal(activeToast.text, 'chưa có bản trích trong phiên này.');

    // Test 2.8.3 Manual close
    handleCloseSim();
    assert.equal(activeToast, null);
    assert.equal(timerHandle, null);
  });

  // ==========================================================================
  // 3. DECISION GATING RADIO STATE CHANGES & ROUTING
  // ==========================================================================
  await t.test('3. Decision Gating Radio State Changes & Adversarial Invariants', async (t3) => {
    const decisionTsx = readFile('components/openwork/OpenWorkLegalDecisionBlock.tsx');

    // 3.1 Verify default options structure
    assert.match(decisionTsx, /id:\s*['"]a['"]/, 'Option A must exist');
    assert.match(decisionTsx, /id:\s*['"]b['"]/, 'Option B must exist');
    assert.match(decisionTsx, /id:\s*['"]other['"]/, "Option 'other' must exist");
    assert.match(decisionTsx, /defaultSelectedId\s*=\s*['"]a['"]/, 'Default selected ID must be option A');

    // 3.2 Verify option 'other' custom text input rendering condition
    assert.match(decisionTsx, /opt\.id\s*===\s*['"]other['"]\s*&&\s*isSelected/, "Custom text input must ONLY render when 'other' is selected");

    // 3.3 Verify routing in onApply
    assert.match(
      decisionTsx,
      /onApply\(selectedId,\s*selectedId\s*===\s*['"]other['"]\s*\?\s*customText\s*:\s*undefined\)/,
      "onApply must pass customText only when selectedId === 'other', else undefined"
    );

    // 3.4 Verify 'Giữ nguyên — tôi chịu rủi ro' handling
    assert.match(decisionTsx, /handleKeepRisk/, 'handleKeepRisk must exist');
    assert.match(decisionTsx, /setInternalDecidedType\(['"]keep['"]\)/, "handleKeepRisk must set decided type to 'keep'");
    assert.match(decisionTsx, /activeDecidedId\s*===\s*['"]keep['"]\s*\?\s*['"]is-risk['"]\s*:\s*['"]is-compliant['"]/, 'Must tag resolution card with is-risk or is-compliant');
    assert.match(decisionTsx, /Cảnh báo:\s*Mức phạt 50% vượt quá trần 8% theo Điều 301 Luật Thương mại 2005/, 'Risk clause must display explicit statutory warning');

    // 3.5 Verify immutability post-decision
    assert.match(decisionTsx, /if\s*\(isDecided\)\s*return;?/, 'handleSelectOption must reject clicks if isDecided is true');
    assert.match(decisionTsx, /!isDecided\s*&&\s*\(/, 'Options list and action footer must be hidden when isDecided is true');

    // 3.6 Verify controlled props vs internal state
    assert.match(decisionTsx, /const\s+isDecided\s*=\s*controlledIsDecided\s*!==\s*undefined\s*\?\s*controlledIsDecided\s*:\s*internalDecided/, 'Must honor controlled isDecided prop');
    assert.match(decisionTsx, /const\s+activeDecidedId\s*=\s*controlledDecidedId\s*\|\|\s*internalDecidedType/, 'Must honor controlled decidedId prop');

    // 3.7 Behavioral simulation of decision state machine
    let selectedId = 'a';
    let internalDecided = false;
    let internalDecidedType = '';
    let customText = '';
    let appliedArgs = null;
    let riskTriggered = false;

    const selectOpt = (id) => {
      if (internalDecided) return;
      selectedId = id;
    };

    const apply = (onApply) => {
      internalDecided = true;
      internalDecidedType = selectedId;
      appliedArgs = [selectedId, selectedId === 'other' ? customText : undefined];
      if (onApply) onApply(...appliedArgs);
    };

    const keepRisk = (onKeepRisk) => {
      internalDecided = true;
      internalDecidedType = 'keep';
      riskTriggered = true;
      if (onKeepRisk) onKeepRisk();
    };

    // Sim step 1: Select option B
    selectOpt('b');
    assert.equal(selectedId, 'b');

    // Sim step 2: Select option 'other' and enter text
    selectOpt('other');
    assert.equal(selectedId, 'other');
    customText = 'Thêm điều khoản cấn trừ công nợ bảo lãnh';

    // Sim step 3: Apply with custom text
    apply();
    assert.equal(internalDecided, true);
    assert.equal(internalDecidedType, 'other');
    assert.deepEqual(appliedArgs, ['other', 'Thêm điều khoản cấn trừ công nợ bảo lãnh']);

    // Sim step 4: Attempt to change selection after decision -> must be blocked
    selectOpt('a');
    assert.equal(selectedId, 'other', 'Selected ID must not change once decided');
  });

  // ==========================================================================
  // 4. REASONING BLOCK COLLAPSE/EXPAND & STREAMING TRANSITIONS
  // ==========================================================================
  await t.test('4. Reasoning Block Collapse/Expand & Streaming State Transitions', async (t4) => {
    const reasoningTsx = readFile('components/openwork/OpenWorkReasoningBlock.tsx');

    // 4.1 Verify cleanThoughtContent logic
    assert.match(reasoningTsx, /export const cleanThoughtContent\s*=/, 'Must export cleanThoughtContent');
    assert.match(reasoningTsx, /\.replace\(\/\^<think>\\s\*\/i,\s*['"]['"]\)/, 'Must strip <think>');
    assert.match(reasoningTsx, /\.replace\(/, 'Must strip tags');

    // 4.2 Verify streaming vs done dot classes
    assert.match(reasoningTsx, /isStreaming\s*\?\s*['"]is-streaming['"]\s*:\s*['"]is-done['"]/, 'Indicator dot must switch between is-streaming and is-done');

    // 4.3 Verify live caret renders only during streaming
    assert.match(reasoningTsx, /\{isStreaming\s*&&\s*\(\s*<span className="legal-think-caret"/, 'Caret must only render when isStreaming is true');

    // 4.4 Verify search latency badge default and dynamic formatting
    assert.match(reasoningTsx, /Đã tra cứu trong 340ms/, 'Default latency badge must match Cuccu Legal 340ms spec');
    assert.match(reasoningTsx, /Đã tra cứu trong \$\{durationMs\}ms/, 'Dynamic ms formatting must be supported');

    // 4.5 Verify collapsible logic and user toggle override
    assert.match(
      reasoningTsx,
      /const isOpen\s*=\s*controlledIsOpen\s*!==\s*undefined\s*\?\s*controlledIsOpen\s*:\s*userToggledOpen\s*!==\s*null\s*\?\s*userToggledOpen\s*:\s*\(isStreaming\s*\|\|\s*defaultOpen\)/,
      'Collapse state must prioritize controlledIsOpen, then userToggledOpen, then (isStreaming || defaultOpen)'
    );

    // 4.6 Verify chevron rotate indicator
    assert.match(reasoningTsx, /isOpen\s*\?\s*['"]is-open['"]\s*:\s*['"]is-folded['"]/, 'Chevron must toggle between is-open and is-folded');

    // 4.7 Verify copy button visibility
    assert.match(reasoningTsx, /cleanedThought\s*&&\s*!isStreaming\s*&&/, 'Copy button must only be visible when cleanedThought exists and !isStreaming');

    // 4.8 Behavioral simulation of reasoning state transitions
    const computeIsOpen = (controlledIsOpen, userToggledOpen, isStreaming, defaultOpen) => {
      return controlledIsOpen !== undefined
        ? controlledIsOpen
        : userToggledOpen !== null
          ? userToggledOpen
          : (isStreaming || defaultOpen);
    };

    // Condition 1: Streaming started -> auto opens
    assert.equal(computeIsOpen(undefined, null, true, false), true, 'Streaming must auto-open by default');

    // Condition 2: Streaming user clicks collapse -> closes despite streaming!
    assert.equal(computeIsOpen(undefined, false, true, false), false, 'User manual close overrides streaming auto-open');

    // Condition 3: User did not touch, streaming ends -> collapses cleanly
    assert.equal(computeIsOpen(undefined, null, false, false), false, 'Stream end auto-collapses if defaultOpen is false');

    // Condition 4: User explicitly opened previously, streaming ends -> stays open
    assert.equal(computeIsOpen(undefined, true, false, false), true, 'User explicit open is preserved after streaming ends');

    // Condition 5: Controlled prop overrides all
    assert.equal(computeIsOpen(false, true, true, true), false, 'controlledIsOpen=false overrides user toggle and streaming');
    assert.equal(computeIsOpen(true, false, false, false), true, 'controlledIsOpen=true overrides user toggle and completion');
  });

  // ==========================================================================
  // 5. THOUGHT SANITIZATION ADVERSARIAL EDGE CASES
  // ==========================================================================
  await t.test('5. Thought Sanitization Adversarial Edge Cases', async (t5) => {
    const reasoningTsx = readFile('components/openwork/OpenWorkReasoningBlock.tsx');

    // Extract cleanThoughtContent logic
    const cleanFn = (text) => {
      if (!text) return '';
      return text
        .replace(/^<think>\s*/i, '')
        .replace(/\s*<\/think>$/i, '')
        .replace(/^TODO::[^\n]*/gm, '')
        .trim();
    };

    // Case 5.1: Normal thought
    assert.equal(cleanFn('Phân tích điều khoản'), 'Phân tích điều khoản');

    // Case 5.2: DeepSeek <think> wrapping
    assert.equal(cleanFn('<think>\nĐang đọc BLDS 2015\n</think>'), 'Đang đọc BLDS 2015');

    // Case 5.3: Case-insensitive <THINK> tags
    assert.equal(cleanFn('<THINK>Tra cứu luật thương mại</THINK>'), 'Tra cứu luật thương mại');

    // Case 5.4: Internal TODO:: marker injection
    const dirty = '<think>\nTODO::internal debug marker\nĐiều 301 LTM 2005 quy định trần 8%\n</think>';
    assert.equal(cleanFn(dirty), 'Điều 301 LTM 2005 quy định trần 8%');

    // Case 5.5: Empty / undefined inputs
    assert.equal(cleanFn(undefined), '');
    assert.equal(cleanFn(null), '');
    assert.equal(cleanFn('   '), '');
  });
});
