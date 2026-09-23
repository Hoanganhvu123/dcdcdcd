import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_STRATEGY_DECK_SESSION,
  MOCK_FINANCIAL_PNL_SESSION,
  MOCK_AI_ARCHITECTURE_SESSION,
  MOCK_REPLAY_SESSIONS,
} from './fixtures/synthetic-test-fixtures.mjs';
import {
  createReplayEngine,
} from './fixtures/replay-engine-simulator.mjs';

test('Tier 4: Real-World Application Workloads for Kimi Replay & Playback System', async (t) => {

  // =========================================================================
  // Workload 4.1: Full Lifecycle Execution of Showcase 1 (16:9 Strategy Deck)
  // =========================================================================
  await t.test('4.1: Full Lifecycle Replay of Showcase Session 1 (16:9 Executive Strategy Deck)', () => {
    const session = MOCK_STRATEGY_DECK_SESSION;
    const engine = createReplayEngine(session);

    // Initial state
    assert.equal(engine.getState().status, 'idle');
    assert.equal(engine.getState().currentTimeMs, 0);
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 1);

    engine.play();

    // Step 0: Intent & Outline (0..3500ms)
    engine.tick(2000);
    assert.equal(engine.getState().currentStepIndex, 0);
    assert.equal(engine.getState().currentStep.phase, 'intent');
    assert.equal(engine.getState().artifactState.snapshot.slides[0].layout, 'hero');

    // Step 1: SQL Data Query & KPI Stat Grid (3500..7500ms)
    engine.tick(2500); // at 4500ms
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentStep.phase, 'query');
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'sql');
    assert.equal(engine.getState().currentStep.toolCalls[0].output.rowCount, 3);
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 2);
    assert.equal(engine.getState().artifactState.snapshot.slides[1].layout, 'stat_grid');

    // Step 2: Strategic Pillars & Comparison Matrix (7500..11500ms)
    engine.tick(4000); // at 8500ms
    assert.equal(engine.getState().currentStepIndex, 2);
    assert.equal(engine.getState().currentStep.phase, 'code');
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 4);
    assert.equal(engine.getState().artifactState.snapshot.slides[2].layout, 'two_col');
    assert.equal(engine.getState().artifactState.snapshot.slides[3].layout, 'comparison');

    // Step 3: Roadmap Timeline with Python (11500..15000ms)
    engine.tick(4000); // at 12500ms
    assert.equal(engine.getState().currentStepIndex, 3);
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'python');
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 5);
    assert.equal(engine.getState().artifactState.snapshot.slides[4].layout, 'timeline');

    // Step 4: Final Synthesis & Board Approval (15000..18000ms)
    engine.tick(4000); // at 16500ms
    assert.equal(engine.getState().currentStepIndex, 4);
    assert.equal(engine.getState().currentStep.phase, 'synthesis');
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 6);
    assert.equal(engine.getState().artifactState.snapshot.slides[5].layout, 'closing');

    // Finish session
    engine.tick(2000); // reaches 18000ms
    assert.equal(engine.getState().status, 'ended');
    assert.equal(engine.getState().isEnded, true);
    assert.equal(engine.getState().progressPercent, 100);
  });

  // =========================================================================
  // Workload 4.2: Full Lifecycle Execution of Showcase 2 (Financial PnL Model)
  // =========================================================================
  await t.test('4.2: Full Lifecycle Replay of Showcase Session 2 (Multi-Channel Financial PnL & Cash Flow Model)', () => {
    const session = MOCK_FINANCIAL_PNL_SESSION;
    const engine = createReplayEngine(session);

    engine.play();

    // Step 0: Workbook & Sheet Setup (0..4000ms)
    engine.tick(2000);
    assert.equal(engine.getState().currentStepIndex, 0);
    assert.equal(engine.getState().artifactState.snapshot.sheetCount, 3);

    // Step 1: SQL ERP Query & PnL Sheet 1 Calculations (4000..8500ms)
    engine.tick(3000); // at 5000ms
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'sql');
    assert.equal(engine.getState().artifactState.snapshot.activeSheetIndex, 0);
    assert.equal(engine.getState().artifactState.snapshot.activeSheetData.totalRevenueFormula, 'SUM(B4:E4)');

    // Step 2: Python Channel Breakdown on Sheet 2 (8500..14000ms)
    engine.tick(5000); // at 10000ms
    assert.equal(engine.getState().currentStepIndex, 2);
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'python');
    assert.equal(engine.getState().artifactState.snapshot.activeSheetIndex, 1);

    // Step 3: Cash Flow Projections & Stress Test on Sheet 3 (14000..20000ms)
    engine.tick(6000); // at 16000ms
    assert.equal(engine.getState().currentStepIndex, 3);
    assert.equal(engine.getState().artifactState.snapshot.activeSheetIndex, 2);
    assert.equal(engine.getState().artifactState.snapshot.finalNetCash2027, 'D4+D5+D6');

    // Complete session
    engine.tick(5000); // reaches 20000ms
    assert.equal(engine.getState().status, 'ended');
    assert.equal(engine.getState().currentTimeMs, 20000);
  });

  // =========================================================================
  // Workload 4.3: Full Lifecycle Execution of Showcase 3 (Enterprise AI DOCX)
  // =========================================================================
  await t.test('4.3: Full Lifecycle Replay of Showcase Session 3 (Enterprise AI Architecture & Topology Report)', () => {
    const session = MOCK_AI_ARCHITECTURE_SESSION;
    const engine = createReplayEngine(session);

    engine.play();

    // Step 0: A4 Layout & TOC (0..4500ms)
    engine.tick(2000);
    assert.equal(engine.getState().currentStepIndex, 0);
    assert.equal(engine.getState().artifactState.snapshot.tocCount, 5);

    // Step 1: Web Search & Chapter 1/2 Multi-Agent Swarm (4500..10000ms)
    engine.tick(4000); // at 6000ms
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'web_search');
    assert.equal(engine.getState().artifactState.snapshot.hasMultiAgentSection, true);

    // Step 2: Python Latency Benchmarks & Guardrails (10000..16000ms)
    engine.tick(6000); // at 12000ms
    assert.equal(engine.getState().currentStepIndex, 2);
    assert.equal(engine.getState().currentStep.toolCalls[0].toolType, 'python');
    assert.equal(engine.getState().artifactState.snapshot.hasBenchmarkTable, true);

    // Step 3: Rollout Roadmap & CTO Sign-off (16000..22000ms)
    engine.tick(6000); // at 18000ms
    assert.equal(engine.getState().currentStepIndex, 3);
    assert.equal(engine.getState().artifactState.snapshot.isFinalized, true);

    // Complete
    engine.tick(5000); // reaches 22000ms
    assert.equal(engine.getState().status, 'ended');
    assert.equal(engine.getState().currentTimeMs, 22000);
  });

  // =========================================================================
  // Workload 4.4: High-Throughput Accelerated Multi-Speed Simulation
  // =========================================================================
  await t.test('4.4: High-throughput simulation running all 3 showcase sessions at 4x and Instant speeds', () => {
    const speeds = ['1x', '2x', '4x', 'Instant'];
    let runsCount = 0;

    for (const session of MOCK_REPLAY_SESSIONS) {
      for (const sp of speeds) {
        const engine = createReplayEngine(session);
        engine.play();
        engine.setSpeed(sp);

        if (sp !== 'Instant') {
          while (engine.getState().status === 'playing') {
            engine.tick(100);
          }
        }

        assert.equal(engine.getState().status, 'ended');
        assert.equal(engine.getState().currentTimeMs, session.totalDurationMs);
        assert.equal(engine.getState().progressPercent, 100);
        runsCount++;
      }
    }

    assert.equal(runsCount, 12, 'Must successfully execute 12 full lifecycle variations (3 sessions * 4 speeds)');
  });

  // =========================================================================
  // Workload 4.5: Complete End-to-End User Interactive Journey
  // =========================================================================
  await t.test('4.5: Complete End-to-End User Interactive Journey (Load -> Play -> Pause & Inspect SQL -> Seek -> Fork to Live Chat)', () => {
    // 1. User loads Strategy Deck showcase session
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    assert.equal(engine.getState().session.id, 'replay_strategy_deck_169');

    // 2. User presses Play at 1x speed
    engine.play();
    engine.tick(4000); // reaches Step 1 (SQL query step)
    assert.equal(engine.getState().currentStepIndex, 1);

    // 3. User pauses to inspect SQL query output
    engine.pause();
    assert.equal(engine.getState().status, 'paused');
    const sqlTool = engine.getState().currentStep.toolCalls[0];
    assert.equal(sqlTool.toolType, 'sql');
    assert.equal(sqlTool.output.rowCount, 3);

    // 4. User scrubs forward to Step 3 (Timeline roadmap)
    engine.jumpToStep(3);
    assert.equal(engine.getState().currentStepIndex, 3);
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 5);

    // 5. User clicks "Tiếp tục trò chuyện" (Fork Session)
    const forkData = engine.exportForkContext();
    assert.equal(forkData.session_fork_id, 'replay_strategy_deck_169');
    assert.equal(forkData.forkedAtStep, 3);
    assert.equal(forkData.activeArtifactSnapshot.totalSlides, 5);
    assert.equal(forkData.initialMessages[0].role, 'user');
    assert.ok(forkData.initialMessages[forkData.initialMessages.length - 1].content.includes('Bước 4 / 5'));

    // 6. Router parameters format validation
    const queryParams = new URLSearchParams({
      id: forkData.session_fork_id,
      fork_step: String(forkData.forkedAtStep),
      mode: forkData.mode,
    });
    assert.equal(queryParams.get('id'), 'replay_strategy_deck_169');
    assert.equal(queryParams.get('fork_step'), '3');
    assert.equal(queryParams.get('mode'), 'slides');
  });

});
