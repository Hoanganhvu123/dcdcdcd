import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_STRATEGY_DECK_SESSION,
  MOCK_FINANCIAL_PNL_SESSION,
  MOCK_AI_ARCHITECTURE_SESSION,
  MOCK_REPLAY_SESSIONS,
} from './fixtures/synthetic-test-fixtures.mjs';
import {
  validateReplaySession,
  createReplayEngine,
  resolveStepIndex,
  projectArtifactState,
  formatStepCounter,
  formatElapsedTime,
  SPEED_MULTIPLIERS,
  SPEED_INTERVALS_MS,
} from './fixtures/replay-engine-simulator.mjs';

test('Tier 1: Feature Coverage Test Suite for Kimi Replay & Playback System', async (t) => {

  // =========================================================================
  // Section 1.1: Replay Data Schemas & Type Validation (10 Tests)
  // =========================================================================
  await t.test('1.1.1: Schema validation accepts valid Strategy Deck showcase session', () => {
    const res = validateReplaySession(MOCK_STRATEGY_DECK_SESSION);
    assert.equal(res.valid, true, 'Strategy deck session must be valid');
    assert.equal(res.errors.length, 0);
  });

  await t.test('1.1.2: Schema validation accepts valid Financial PnL showcase session', () => {
    const res = validateReplaySession(MOCK_FINANCIAL_PNL_SESSION);
    assert.equal(res.valid, true, 'Financial PnL session must be valid');
    assert.equal(res.errors.length, 0);
  });

  await t.test('1.1.3: Schema validation accepts valid AI Architecture DOCX showcase session', () => {
    const res = validateReplaySession(MOCK_AI_ARCHITECTURE_SESSION);
    assert.equal(res.valid, true, 'AI Architecture session must be valid');
    assert.equal(res.errors.length, 0);
  });

  await t.test('1.1.4: Schema validation rejects null or non-object input', () => {
    assert.equal(validateReplaySession(null).valid, false);
    assert.equal(validateReplaySession(undefined).valid, false);
    assert.equal(validateReplaySession('string').valid, false);
    assert.equal(validateReplaySession(123).valid, false);
  });

  await t.test('1.1.5: Schema validation detects missing required top-level fields', () => {
    const broken = { id: 'test' };
    const res = validateReplaySession(broken);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('title')));
    assert.ok(res.errors.some((e) => e.includes('mode')));
    assert.ok(res.errors.some((e) => e.includes('steps')));
  });

  await t.test('1.1.6: Schema validation checks valid artifact modes', () => {
    const invalidMode = { ...MOCK_STRATEGY_DECK_SESSION, mode: 'invalid_mode' };
    const res = validateReplaySession(invalidMode);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('Invalid mode')));
  });

  await t.test('1.1.7: Schema validation checks step indexing continuity', () => {
    const brokenSteps = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        { ...MOCK_STRATEGY_DECK_SESSION.steps[0], stepIndex: 5 },
      ],
    };
    const res = validateReplaySession(brokenSteps);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('invalid stepIndex')));
  });

  await t.test('1.1.8: Schema validation verifies timestamp monotonicity across steps', () => {
    const nonMonotonic = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        { ...MOCK_STRATEGY_DECK_SESSION.steps[0], endTimeMs: 5000 },
        { ...MOCK_STRATEGY_DECK_SESSION.steps[1], startTimeMs: 4000 },
      ],
    };
    const res = validateReplaySession(nonMonotonic);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('startTimeMs')));
  });

  await t.test('1.1.9: Schema validation ensures thinking trace and artifactPatch objects exist', () => {
    const missingPatch = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        { ...MOCK_STRATEGY_DECK_SESSION.steps[0], artifactPatch: null },
      ],
    };
    const res = validateReplaySession(missingPatch);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('artifactPatch')));
  });

  await t.test('1.1.10: Schema validation verifies all 3 showcase sessions in pre-built library', () => {
    assert.equal(MOCK_REPLAY_SESSIONS.length, 3);
    for (const session of MOCK_REPLAY_SESSIONS) {
      assert.equal(validateReplaySession(session).valid, true);
    }
  });

  // =========================================================================
  // Section 1.2: Playback Clock & State Machine Core (10 Tests)
  // =========================================================================
  await t.test('1.2.1: Engine initializes in idle state with time 0ms', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    const state = engine.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.currentTimeMs, 0);
    assert.equal(state.isPlaying, false);
    assert.equal(state.currentStepIndex, 0);
  });

  await t.test('1.2.2: play() transitions engine to playing state', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    const state = engine.getState();
    assert.equal(state.status, 'playing');
    assert.equal(state.isPlaying, true);
  });

  await t.test('1.2.3: pause() transitions engine to paused state without resetting clock', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(4200);
    engine.pause();
    const state = engine.getState();
    assert.equal(state.status, 'paused');
    assert.equal(state.isPlaying, false);
    assert.equal(state.currentTimeMs, 4200);
  });

  await t.test('1.2.4: togglePlayPause() toggles between playing and paused', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    assert.equal(engine.getState().isPlaying, false);
    engine.togglePlayPause();
    assert.equal(engine.getState().isPlaying, true);
    engine.togglePlayPause();
    assert.equal(engine.getState().isPlaying, false);
  });

  await t.test('1.2.5: togglePlayPause() at end of session loops back to start', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(18000);
    assert.equal(engine.getState().status, 'ended');
    engine.togglePlayPause();
    assert.equal(engine.getState().status, 'playing');
    assert.equal(engine.getState().currentTimeMs, 0);
  });

  await t.test('1.2.6: tick() advances clock by delta at 1x speed', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 500);
    engine.tick(1000);
    assert.equal(engine.getState().currentTimeMs, 1500);
  });

  await t.test('1.2.7: tick() does not advance clock when paused', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(2000);
    engine.pause();
    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 2000);
  });

  await t.test('1.2.8: Progress percent is computed accurately [0%, 100%]', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION); // totalDurationMs = 18000
    engine.seek(0);
    assert.equal(engine.getState().progressPercent, 0);
    engine.seek(9000);
    assert.equal(engine.getState().progressPercent, 50);
    engine.seek(18000);
    assert.equal(engine.getState().progressPercent, 100);
  });

  await t.test('1.2.9: Sub-step progress computes [0.0, 1.0] normalized value within step', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    // Step 0 duration is 0..3500ms
    engine.seek(1750);
    assert.equal(engine.getState().subStepProgress, 0.5);
    engine.seek(3500);
    // At 3500ms, step 1 starts (3500..7500ms)
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().subStepProgress, 0.0);
  });

  await t.test('1.2.10: Elapsed time formatter produces monospace strings (1.8s, 14.2s)', () => {
    assert.equal(formatElapsedTime(0), '0.0s');
    assert.equal(formatElapsedTime(1800), '1.8s');
    assert.equal(formatElapsedTime(14200), '14.2s');
    assert.equal(formatElapsedTime(60000), '60.0s');
  });

  // =========================================================================
  // Section 1.3: Discrete Step Seeking & Navigation (8 Tests)
  // =========================================================================
  await t.test('1.3.1: resolveStepIndex maps timestamps to correct step indices', () => {
    const s = MOCK_STRATEGY_DECK_SESSION;
    assert.equal(resolveStepIndex(s, 0), 0);
    assert.equal(resolveStepIndex(s, 2000), 0);
    assert.equal(resolveStepIndex(s, 3500), 1);
    assert.equal(resolveStepIndex(s, 7500), 2);
    assert.equal(resolveStepIndex(s, 11500), 3);
    assert.equal(resolveStepIndex(s, 15000), 4);
    assert.equal(resolveStepIndex(s, 18000), 4);
  });

  await t.test('1.3.2: jumpToStep aligns clock to start of target step', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(2);
    assert.equal(engine.getState().currentStepIndex, 2);
    assert.equal(engine.getState().currentTimeMs, 7500);
  });

  await t.test('1.3.3: stepNext advances to next step start time', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(1000); // in Step 0
    engine.stepNext();
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentTimeMs, 3500);
  });

  await t.test('1.3.4: stepPrev moves back to previous step start time', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(8000); // in Step 2
    engine.stepPrev();
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentTimeMs, 3500);
  });

  await t.test('1.3.5: stepPrev at Step 0 clamps to 0ms', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(500);
    engine.stepPrev();
    assert.equal(engine.getState().currentTimeMs, 0);
    assert.equal(engine.getState().currentStepIndex, 0);
  });

  await t.test('1.3.6: stepNext at final step clamps to total duration and marks ended', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(4);
    engine.stepNext();
    assert.equal(engine.getState().currentTimeMs, 18000);
    assert.equal(engine.getState().status, 'ended');
  });

  await t.test('1.3.7: seekPercent maps [0..100] percentage to millisecond offset', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seekPercent(25);
    assert.equal(engine.getState().currentTimeMs, 4500);
    assert.equal(engine.getState().currentStepIndex, 1);
  });

  await t.test('1.3.8: formatStepCounter generates formatted step title pills', () => {
    const title = formatStepCounter(0, 5, 'Phân tích đề bài');
    assert.equal(title, 'Bước 1 / 5: Phân tích đề bài');
    const simple = formatStepCounter(2, 5);
    assert.equal(simple, 'Bước 3 / 5');
  });

  // =========================================================================
  // Section 1.4: Speed Multipliers & Time Scaling (6 Tests)
  // =========================================================================
  await t.test('1.4.1: Speed multipliers are defined for 1x, 2x, 5x, Instant', () => {
    assert.equal(SPEED_MULTIPLIERS['1x'], 1.0);
    assert.equal(SPEED_MULTIPLIERS['2x'], 2.0);
    assert.equal(SPEED_MULTIPLIERS['5x'], 5.0);
    assert.equal(SPEED_MULTIPLIERS['Instant'], Infinity);
  });

  await t.test('1.4.2: Speed intervals conform to 3000ms, 1500ms, 600ms, 0ms specs', () => {
    assert.equal(SPEED_INTERVALS_MS['1x'], 3000);
    assert.equal(SPEED_INTERVALS_MS['2x'], 1500);
    assert.equal(SPEED_INTERVALS_MS['5x'], 600);
    assert.equal(SPEED_INTERVALS_MS['Instant'], 0);
  });

  await t.test('1.4.3: 2x speed advances clock at double rate', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('2x');
    engine.play();
    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 1000);
  });

  await t.test('1.4.4: 5x speed advances clock at quintuple rate', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('5x');
    engine.play();
    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 2500);
  });

  await t.test('1.4.5: Instant speed immediately completes session', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('Instant');
    const state = engine.getState();
    assert.equal(state.currentTimeMs, 18000);
    assert.equal(state.status, 'ended');
    assert.equal(state.isEnded, true);
  });

  await t.test('1.4.6: Switching speed mid-stream retains active step position', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(5000);
    engine.setSpeed('5x');
    assert.equal(engine.getState().currentTimeMs, 5000);
    assert.equal(engine.getState().speed, '5x');
  });

  // =========================================================================
  // Section 1.5: Slide Mode Artifact Synchronization (6 Tests)
  // =========================================================================
  await t.test('1.5.1: Slide Mode Step 0 renders cover slide (Slide 1)', () => {
    const state = projectArtifactState(MOCK_STRATEGY_DECK_SESSION, 1000);
    assert.equal(state.mode, 'slides');
    assert.equal(state.stepIndex, 0);
    assert.equal(state.snapshot.totalSlides, 1);
    assert.equal(state.snapshot.slides[0].layout, 'hero');
  });

  await t.test('1.5.2: Slide Mode Step 1 appends KPI Stat Grid slide (Slide 2)', () => {
    const state = projectArtifactState(MOCK_STRATEGY_DECK_SESSION, 5000);
    assert.equal(state.stepIndex, 1);
    assert.equal(state.snapshot.totalSlides, 2);
    assert.equal(state.snapshot.slides[1].layout, 'stat_grid');
  });

  await t.test('1.5.3: Slide Mode Step 2 appends 2-Col and Comparison slides (Slides 3 & 4)', () => {
    const state = projectArtifactState(MOCK_STRATEGY_DECK_SESSION, 9000);
    assert.equal(state.stepIndex, 2);
    assert.equal(state.snapshot.totalSlides, 4);
    assert.equal(state.snapshot.slides[2].layout, 'two_col');
    assert.equal(state.snapshot.slides[3].layout, 'comparison');
  });

  await t.test('1.5.4: Slide Mode Step 3 appends 4-Quarter Timeline slide (Slide 5)', () => {
    const state = projectArtifactState(MOCK_STRATEGY_DECK_SESSION, 13000);
    assert.equal(state.stepIndex, 3);
    assert.equal(state.snapshot.totalSlides, 5);
    assert.equal(state.snapshot.slides[4].layout, 'timeline');
  });

  await t.test('1.5.5: Slide Mode Step 4 finalizes with Closing Sign-off slide (Slide 6)', () => {
    const state = projectArtifactState(MOCK_STRATEGY_DECK_SESSION, 17000);
    assert.equal(state.stepIndex, 4);
    assert.equal(state.isFinalStep, true);
    assert.equal(state.snapshot.totalSlides, 6);
    assert.equal(state.snapshot.slides[5].layout, 'closing');
  });

  await t.test('1.5.6: Slide Mode step patch metadata contains correct action types', () => {
    const steps = MOCK_STRATEGY_DECK_SESSION.steps;
    assert.equal(steps[0].artifactPatch.action, 'init');
    assert.equal(steps[1].artifactPatch.action, 'append');
    assert.equal(steps[2].artifactPatch.action, 'append');
    assert.equal(steps[3].artifactPatch.action, 'append');
    assert.equal(steps[4].artifactPatch.action, 'finalize');
  });

  // =========================================================================
  // Section 1.6: Excel Mode Artifact Synchronization (6 Tests)
  // =========================================================================
  await t.test('1.6.1: Excel Mode Step 0 initializes 3 workbook sheets', () => {
    const state = projectArtifactState(MOCK_FINANCIAL_PNL_SESSION, 2000);
    assert.equal(state.mode, 'sheets');
    assert.equal(state.snapshot.sheetCount, 3);
    assert.deepEqual(state.snapshot.sheetNames, ['Summary PnL', 'Channel Breakdown', 'Cash Flow Forecast']);
  });

  await t.test('1.6.2: Excel Mode Step 1 executes SQL and populates PnL formulas on Sheet 1', () => {
    const state = projectArtifactState(MOCK_FINANCIAL_PNL_SESSION, 6000);
    assert.equal(state.stepIndex, 1);
    assert.equal(state.snapshot.activeSheetIndex, 0);
    assert.equal(state.snapshot.activeSheetData.totalRevenueFormula, 'SUM(B4:E4)');
    assert.equal(state.snapshot.activeSheetData.grossMarginFormula, 'F6/F4');
  });

  await t.test('1.6.3: Excel Mode Step 2 executes Python and activates Channel Breakdown Sheet 2', () => {
    const state = projectArtifactState(MOCK_FINANCIAL_PNL_SESSION, 10000);
    assert.equal(state.stepIndex, 2);
    assert.equal(state.snapshot.activeSheetIndex, 1);
  });

  await t.test('1.6.4: Excel Mode Step 3 completes Cash Flow Forecast on Sheet 3', () => {
    const state = projectArtifactState(MOCK_FINANCIAL_PNL_SESSION, 17000);
    assert.equal(state.stepIndex, 3);
    assert.equal(state.snapshot.activeSheetIndex, 2);
    assert.equal(state.snapshot.finalNetCash2027, 'D4+D5+D6');
  });

  await t.test('1.6.5: Excel Mode patch structures contain formula definitions', () => {
    const pnlStep = MOCK_FINANCIAL_PNL_SESSION.steps[1];
    const cells = pnlStep.artifactPatch.sheetDelta.sheets[0].cells;
    assert.equal(cells.F4.f, 'SUM(B4:E4)');
    assert.equal(cells.B6.f, 'B4-B5');
    assert.equal(cells.B7.f, 'B6/B4');
  });

  await t.test('1.6.6: Excel Mode tool execution traces contain SQL queries and Python code', () => {
    const pnlStep = MOCK_FINANCIAL_PNL_SESSION.steps[1];
    assert.equal(pnlStep.toolCalls[0].toolType, 'sql');
    assert.ok(pnlStep.toolCalls[0].input.query.includes('erp_financial_ledger'));
    const channelStep = MOCK_FINANCIAL_PNL_SESSION.steps[2];
    assert.equal(channelStep.toolCalls[0].toolType, 'python');
  });

  // =========================================================================
  // Section 1.7: Word/DOCX Mode Artifact Synchronization (6 Tests)
  // =========================================================================
  await t.test('1.7.1: DOCX Mode Step 0 establishes A4 document structure & 5-section TOC', () => {
    const state = projectArtifactState(MOCK_AI_ARCHITECTURE_SESSION, 2000);
    assert.equal(state.mode, 'docs');
    assert.equal(state.stepIndex, 0);
    assert.equal(state.snapshot.tocCount, 5);
    assert.equal(state.snapshot.documentTitle, 'BÁO CÁO KIẾN TRÚC HỆ THỐNG AI DOANH NGHIỆP');
  });

  await t.test('1.7.2: DOCX Mode Step 1 appends Executive Summary & 3-Tier Multi-Agent Swarm', () => {
    const state = projectArtifactState(MOCK_AI_ARCHITECTURE_SESSION, 7000);
    assert.equal(state.stepIndex, 1);
    assert.equal(state.snapshot.hasMultiAgentSection, true);
    assert.equal(state.patch.docxDelta.activeSectionId, 'sec-2');
  });

  await t.test('1.7.3: DOCX Mode Step 2 appends Security Guardrails & Benchmark Table', () => {
    const state = projectArtifactState(MOCK_AI_ARCHITECTURE_SESSION, 13000);
    assert.equal(state.stepIndex, 2);
    assert.equal(state.snapshot.hasBenchmarkTable, true);
    assert.equal(state.patch.docxDelta.activeSectionId, 'sec-4');
  });

  await t.test('1.7.4: DOCX Mode Step 3 finalizes document with Rollout Roadmap & Sign-off', () => {
    const state = projectArtifactState(MOCK_AI_ARCHITECTURE_SESSION, 18000);
    assert.equal(state.stepIndex, 3);
    assert.equal(state.snapshot.isFinalized, true);
    assert.equal(state.snapshot.sectionsCount, 5);
  });

  await t.test('1.7.5: DOCX Mode Table of Contents contains 5 numbered hierarchical sections', () => {
    const toc = MOCK_AI_ARCHITECTURE_SESSION.steps[0].artifactPatch.docxDelta.tableOfContents;
    assert.equal(toc.length, 5);
    assert.ok(toc[0].title.startsWith('1.'));
    assert.ok(toc[1].title.startsWith('2.'));
    assert.ok(toc[2].title.startsWith('3.'));
    assert.ok(toc[3].title.startsWith('4.'));
    assert.ok(toc[4].title.startsWith('5.'));
  });

  await t.test('1.7.6: DOCX Mode Web Search tool traces are captured with citations', () => {
    const step1 = MOCK_AI_ARCHITECTURE_SESSION.steps[1];
    assert.equal(step1.toolCalls[0].toolType, 'web_search');
    assert.equal(step1.toolCalls[0].output.searchResults[0].url, 'https://dbgpt.ai/docs/multi-agent');
  });

  // =========================================================================
  // Section 1.8: Fork Session & Live Chat Handover (5 Tests)
  // =========================================================================
  await t.test('1.8.1: exportForkContext serializes session ID, mode, and step position', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(2);
    const forkData = engine.exportForkContext();
    assert.equal(forkData.session_fork_id, 'replay_strategy_deck_169');
    assert.equal(forkData.mode, 'slides');
    assert.equal(forkData.forkedAtStep, 2);
    assert.equal(forkData.forkedAtTimeMs, 7500);
  });

  await t.test('1.8.2: exportForkContext preserves initial user prompt and agent response', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    const forkData = engine.exportForkContext();
    assert.equal(forkData.initialMessages[0].role, 'user');
    assert.ok(forkData.initialMessages[0].content.includes('Executive Strategy'));
    assert.equal(forkData.initialMessages[1].role, 'assistant');
  });

  await t.test('1.8.3: exportForkContext injects replay origin handover banner message', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(1);
    const forkData = engine.exportForkContext();
    const lastMsg = forkData.initialMessages[forkData.initialMessages.length - 1];
    assert.ok(lastMsg.content.includes('[Forked from Replay'));
    assert.ok(lastMsg.content.includes('Bước 2 / 5'));
  });

  await t.test('1.8.4: exportForkContext captures exact active artifact snapshot at fork point', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(1); // 2 slides generated
    const forkData = engine.exportForkContext();
    assert.equal(forkData.activeArtifactSnapshot.totalSlides, 2);
  });

  await t.test('1.8.5: exportForkContext works across all 3 showcase artifact types', () => {
    for (const session of MOCK_REPLAY_SESSIONS) {
      const engine = createReplayEngine(session);
      const fork = engine.exportForkContext();
      assert.equal(fork.mode, session.mode);
      assert.ok(fork.initialMessages.length >= 2);
    }
  });

});
