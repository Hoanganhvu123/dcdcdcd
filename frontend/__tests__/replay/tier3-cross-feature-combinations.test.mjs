import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_STRATEGY_DECK_SESSION,
  MOCK_FINANCIAL_PNL_SESSION,
  MOCK_AI_ARCHITECTURE_SESSION,
} from './fixtures/synthetic-test-fixtures.mjs';
import {
  createReplayEngine,
} from './fixtures/replay-engine-simulator.mjs';

test('Tier 3: Cross-Feature Combinations Test Suite for Kimi Replay & Playback System', async (t) => {

  // =========================================================================
  // Section 3.1: Scrub Mid-Playback While Speed Switching (3 Tests)
  // =========================================================================
  await t.test('3.1.1: Play at 2x -> Scrub to 50% -> Change speed to 4x -> Tick -> Verify exact time accumulation', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('2x');
    engine.play();
    engine.tick(1000); // 1000ms at 2x = 2000ms
    assert.equal(engine.getState().currentTimeMs, 2000);

    // Scrub to 50% (9000ms)
    engine.seekPercent(50);
    assert.equal(engine.getState().currentTimeMs, 9000);
    assert.equal(engine.getState().currentStepIndex, 2);

    // Change speed to 4x while still playing
    engine.setSpeed('4x');
    assert.equal(engine.getState().speed, '4x');

    // Tick 500ms at 4x = +2000ms -> 11000ms
    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 11000);
    assert.equal(engine.getState().currentStepIndex, 2);
  });

  await t.test('3.1.2: Instant speed switch mid-playback immediately resolves final state and stops ticking', () => {
    const engine = createReplayEngine(MOCK_FINANCIAL_PNL_SESSION);
    engine.play();
    engine.tick(2000); // at 2000ms (Step 0)
    assert.equal(engine.getState().currentStepIndex, 0);

    engine.setSpeed('Instant');
    assert.equal(engine.getState().currentTimeMs, 20000);
    assert.equal(engine.getState().isEnded, true);
    assert.equal(engine.getState().artifactState.isFinalStep, true);

    // Further ticks should have zero effect
    engine.tick(1000);
    assert.equal(engine.getState().currentTimeMs, 20000);
  });

  await t.test('3.1.3: Speed change when paused retains paused status and new speed multiplier', () => {
    const engine = createReplayEngine(MOCK_AI_ARCHITECTURE_SESSION);
    engine.seek(5000);
    engine.pause();
    engine.setSpeed('4x');
    assert.equal(engine.getState().status, 'paused');
    assert.equal(engine.getState().speed, '4x');
    assert.equal(engine.getState().currentTimeMs, 5000);
  });

  // =========================================================================
  // Section 3.2: Manual Artifact Interaction Pausing Playback (3 Tests)
  // =========================================================================
  await t.test('3.2.1: Manual artifact interaction pauses active playback and marks isInteractivePaused', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.tick(1000); // at 1000ms
    assert.equal(engine.getState().isPlaying, true);

    // User clicks slide thumbnail or zooms artifact
    engine.triggerInteraction();
    const state = engine.getState();
    assert.equal(state.status, 'paused');
    assert.equal(state.isPlaying, false);
    assert.equal(state.isInteractivePaused, true);
  });

  await t.test('3.2.2: resumeFromInteraction clears interactive pause and resumes playback cleanly', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(4000);
    engine.triggerInteraction();
    assert.equal(engine.getState().isInteractivePaused, true);

    engine.resumeFromInteraction();
    const state = engine.getState();
    assert.equal(state.status, 'playing');
    assert.equal(state.isPlaying, true);
    assert.equal(state.isInteractivePaused, false);
    assert.equal(state.currentTimeMs, 4000);
  });

  await t.test('3.2.3: Manual interaction when already paused does not break state or throw', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.pause();
    engine.triggerInteraction();
    assert.equal(engine.getState().status, 'paused');
    assert.equal(engine.getState().isInteractivePaused, false);
  });

  // =========================================================================
  // Section 3.3: Session Switching Across Different Artifact Modes (3 Tests)
  // =========================================================================
  await t.test('3.3.1: Switch from Slides session to Sheets session completely resets workspace mode and clock', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(15000); // Step 4 in slides
    assert.equal(engine.getState().artifactState.mode, 'slides');
    assert.equal(engine.getState().artifactState.snapshot.totalSlides, 6);

    // Switch to Excel Sheets session
    engine.setSession(MOCK_FINANCIAL_PNL_SESSION);
    const state = engine.getState();
    assert.equal(state.session.id, 'replay_financial_pnl_xlsx');
    assert.equal(state.artifactState.mode, 'sheets');
    assert.equal(state.currentTimeMs, 0);
    assert.equal(state.currentStepIndex, 0);
    assert.equal(state.artifactState.snapshot.sheetCount, 3);
  });

  await t.test('3.3.2: Switch from Sheets session to DOCX session establishes A4 document model', () => {
    const engine = createReplayEngine(MOCK_FINANCIAL_PNL_SESSION);
    engine.seek(10000);
    assert.equal(engine.getState().artifactState.mode, 'sheets');

    engine.setSession(MOCK_AI_ARCHITECTURE_SESSION);
    const state = engine.getState();
    assert.equal(state.session.id, 'replay_ai_architecture_docx');
    assert.equal(state.artifactState.mode, 'docs');
    assert.equal(state.artifactState.snapshot.tocCount, 5);
  });

  await t.test('3.3.3: Rapid 3-way session switching (Slides -> Sheets -> DOCX -> Slides) leaves clean isolated state', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSession(MOCK_FINANCIAL_PNL_SESSION);
    engine.setSession(MOCK_AI_ARCHITECTURE_SESSION);
    engine.setSession(MOCK_STRATEGY_DECK_SESSION);

    const state = engine.getState();
    assert.equal(state.session.id, 'replay_strategy_deck_169');
    assert.equal(state.artifactState.mode, 'slides');
    assert.equal(state.currentStepIndex, 0);
    assert.equal(state.artifactState.snapshot.totalSlides, 1);
  });

  // =========================================================================
  // Section 3.4: Seeking to Arbitrary Step Then Forking Session (3 Tests)
  // =========================================================================
  await t.test('3.4.1: Forking session at Step 1 exports snapshot with 2 slides (not final 6 slides)', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(1); // Step 1 (2 slides)
    const fork = engine.exportForkContext();
    assert.equal(fork.forkedAtStep, 1);
    assert.equal(fork.activeArtifactSnapshot.totalSlides, 2);
  });

  await t.test('3.4.2: Forking session at Step 3 exports snapshot with 5 slides', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(3); // Step 3 (5 slides)
    const fork = engine.exportForkContext();
    assert.equal(fork.forkedAtStep, 3);
    assert.equal(fork.activeArtifactSnapshot.totalSlides, 5);
  });

  await t.test('3.4.3: Forking Financial PnL session at Step 2 captures 4-channel breakdown snapshot', () => {
    const engine = createReplayEngine(MOCK_FINANCIAL_PNL_SESSION);
    engine.jumpToStep(2); // Step 2 (Channel breakdown active)
    const fork = engine.exportForkContext();
    assert.equal(fork.forkedAtStep, 2);
    assert.equal(fork.activeArtifactSnapshot.activeSheetIndex, 1);
  });

  // =========================================================================
  // Section 3.5: Step Jumping During Active Playback Loop (3 Tests)
  // =========================================================================
  await t.test('3.5.1: stepNext while playing continues playing from new step time', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(1000); // Step 0
    engine.stepNext();  // Jump to Step 1 (3500ms)
    assert.equal(engine.getState().isPlaying, true);
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentTimeMs, 3500);

    engine.tick(500);
    assert.equal(engine.getState().currentTimeMs, 4000);
  });

  await t.test('3.5.2: stepPrev while playing continues playing from previous step time', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(8000); // Step 2 (7500ms)
    engine.stepPrev();  // Jump to Step 1 (3500ms)
    assert.equal(engine.getState().isPlaying, true);
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().currentTimeMs, 3500);
  });

  await t.test('3.5.3: Seeking to exact session end while playing triggers ended state immediately', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(18000);
    assert.equal(engine.getState().status, 'ended');
    assert.equal(engine.getState().isEnded, true);
  });

  // =========================================================================
  // Section 3.6: Multi-Subscriber Dual-Pane Synchronization (3 Tests)
  // =========================================================================
  await t.test('3.6.1: Both Left Reasoning Pane and Right Artifact Workspace receive identical synchronized state', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    let leftPaneState = null;
    let rightPaneState = null;

    engine.subscribe((state) => {
      leftPaneState = { stepIndex: state.currentStepIndex, title: state.currentStep.title };
      rightPaneState = { mode: state.artifactState.mode, slideCount: state.artifactState.snapshot.totalSlides };
    });

    engine.jumpToStep(2);
    assert.equal(leftPaneState.stepIndex, 2);
    assert.equal(rightPaneState.slideCount, 4);
  });

  await t.test('3.6.2: Unsubscribing one listener does not interfere with remaining listeners', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    let l1Count = 0;
    let l2Count = 0;

    const unsub1 = engine.subscribe(() => l1Count++);
    engine.subscribe(() => l2Count++);

    engine.seek(2000);
    assert.equal(l1Count, 1);
    assert.equal(l2Count, 1);

    unsub1();
    engine.seek(4000);
    assert.equal(l1Count, 1);
    assert.equal(l2Count, 2);
  });

  await t.test('3.6.3: High-frequency state emissions (100 ticks) dispatch synchronously to all listeners', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    let receivedTicks = 0;
    engine.play();
    engine.subscribe(() => receivedTicks++);

    for (let i = 0; i < 100; i++) {
      engine.tick(20);
    }
    assert.equal(receivedTicks, 100);
  });

});
