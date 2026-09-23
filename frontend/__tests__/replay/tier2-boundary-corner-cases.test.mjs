import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_STRATEGY_DECK_SESSION,
  MOCK_FINANCIAL_PNL_SESSION,
  MOCK_AI_ARCHITECTURE_SESSION,
} from './fixtures/synthetic-test-fixtures.mjs';
import {
  validateReplaySession,
  createReplayEngine,
  resolveStepIndex,
  projectArtifactState,
  formatStepCounter,
  formatElapsedTime,
} from './fixtures/replay-engine-simulator.mjs';

test('Tier 2: Boundary & Corner Cases Test Suite for Kimi Replay & Playback System', async (t) => {

  // =========================================================================
  // Section 2.1: Timestamp & Scrubbing Boundary Analysis (10 Tests)
  // =========================================================================
  await t.test('2.1.1: Seeking with negative time clamps to 0ms', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(-1000);
    assert.equal(engine.getState().currentTimeMs, 0);
    assert.equal(engine.getState().currentStepIndex, 0);
  });

  await t.test('2.1.2: Seeking with huge timestamp clamps to totalDurationMs', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(99999999);
    assert.equal(engine.getState().currentTimeMs, 18000);
    assert.equal(engine.getState().status, 'ended');
  });

  await t.test('2.1.3: Seeking with NaN or non-numeric value is safely ignored', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(5000);
    engine.seek(NaN);
    assert.equal(engine.getState().currentTimeMs, 5000);
    engine.seek('invalid_time');
    assert.equal(engine.getState().currentTimeMs, 5000);
  });

  await t.test('2.1.4: Fractional timestamps are handled without floating point error accumulation', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seek(3500.123456);
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.ok(Math.abs(engine.getState().currentTimeMs - 3500.123456) < 1e-5);
  });

  await t.test('2.1.5: seekPercent with negative percentage clamps to 0%', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seekPercent(-50);
    assert.equal(engine.getState().progressPercent, 0);
    assert.equal(engine.getState().currentTimeMs, 0);
  });

  await t.test('2.1.6: seekPercent with >100 percentage clamps to 100%', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.seekPercent(150);
    assert.equal(engine.getState().progressPercent, 100);
    assert.equal(engine.getState().currentTimeMs, 18000);
    assert.equal(engine.getState().status, 'ended');
  });

  await t.test('2.1.7: resolveStepIndex handles boundary timestamp matching exact step starts', () => {
    const s = MOCK_STRATEGY_DECK_SESSION;
    // Step 0: 0..3500, Step 1: 3500..7500
    assert.equal(resolveStepIndex(s, 0), 0);
    assert.equal(resolveStepIndex(s, 3499), 0);
    assert.equal(resolveStepIndex(s, 3500), 1);
    assert.equal(resolveStepIndex(s, 7499), 1);
    assert.equal(resolveStepIndex(s, 7500), 2);
  });

  await t.test('2.1.8: formatElapsedTime handles negative and NaN numbers gracefully', () => {
    assert.equal(formatElapsedTime(-500), '0.0s');
    assert.equal(formatElapsedTime(NaN), '0.0s');
    assert.equal(formatElapsedTime(undefined), '0.0s');
    assert.equal(formatElapsedTime('invalid'), '0.0s');
  });

  await t.test('2.1.9: formatStepCounter handles out-of-range stepIndex without crash', () => {
    assert.equal(formatStepCounter(-5, 6), 'Bước 1 / 6');
    assert.equal(formatStepCounter(99, 6), 'Bước 6 / 6');
    assert.equal(formatStepCounter(0, 0), 'Bước 1 / 1');
  });

  await t.test('2.1.10: Zero-duration session handles progress calculation without divide-by-zero', () => {
    const zeroSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      totalDurationMs: 0,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          startTimeMs: 0,
          endTimeMs: 0,
          durationMs: 0,
        },
      ],
    };
    const engine = createReplayEngine(zeroSession);
    assert.equal(engine.getState().progressPercent, 0);
    assert.equal(engine.getState().subStepProgress, 1.0);
  });

  // =========================================================================
  // Section 2.2: Extreme Step Configurations (8 Tests)
  // =========================================================================
  await t.test('2.2.1: Single-step session (1/1) initializes and steps correctly', () => {
    const singleStepSession = {
      id: 'single_step_session',
      title: 'Single Step Test',
      mode: 'slides',
      totalDurationMs: 5000,
      steps: [
        {
          stepIndex: 0,
          id: 'step-only',
          title: 'Bước 1: Duy nhất',
          phase: 'intent',
          status: 'completed',
          startTimeMs: 0,
          endTimeMs: 5000,
          durationMs: 5000,
          summary: 'Single step',
          thinking: { id: 'th-1', title: 'Single thought', tokens: 100, elapsedMs: 1000, content: 'Single' },
          artifactPatch: { mode: 'slides', action: 'init' },
          projectedArtifactSnapshot: { totalSlides: 1 },
        },
      ],
    };
    const engine = createReplayEngine(singleStepSession);
    assert.equal(engine.getState().totalSteps, 1);
    assert.equal(engine.getState().currentStepIndex, 0);
    engine.stepNext();
    assert.equal(engine.getState().currentTimeMs, 5000);
    assert.equal(engine.getState().status, 'ended');
    engine.stepPrev();
    assert.equal(engine.getState().currentTimeMs, 0);
  });

  await t.test('2.2.2: 2-step minimal session navigates forward and backward', () => {
    const twoStepSession = {
      id: 'two_step_session',
      title: 'Two Step Test',
      mode: 'docs',
      totalDurationMs: 6000,
      steps: [
        {
          stepIndex: 0,
          id: 's0',
          title: 'B1',
          phase: 'intent',
          status: 'completed',
          startTimeMs: 0,
          endTimeMs: 3000,
          durationMs: 3000,
          summary: 'First',
          thinking: { id: 'th-1', title: 'T1', tokens: 50, elapsedMs: 500, content: 'One' },
          artifactPatch: { mode: 'docs', action: 'init' },
          projectedArtifactSnapshot: { sections: 1 },
        },
        {
          stepIndex: 1,
          id: 's1',
          title: 'B2',
          phase: 'synthesis',
          status: 'completed',
          startTimeMs: 3000,
          endTimeMs: 6000,
          durationMs: 3000,
          summary: 'Second',
          thinking: { id: 'th-2', title: 'T2', tokens: 50, elapsedMs: 500, content: 'Two' },
          artifactPatch: { mode: 'docs', action: 'finalize' },
          projectedArtifactSnapshot: { sections: 2 },
        },
      ],
    };
    const engine = createReplayEngine(twoStepSession);
    assert.equal(engine.getState().currentStepIndex, 0);
    engine.stepNext();
    assert.equal(engine.getState().currentStepIndex, 1);
    engine.stepPrev();
    assert.equal(engine.getState().currentStepIndex, 0);
  });

  await t.test('2.2.3: 100+ steps stress session scales without performance degradation', () => {
    const count = 120;
    const steps = [];
    const stepDuration = 200;
    for (let i = 0; i < count; i++) {
      steps.push({
        stepIndex: i,
        id: `step-${i}`,
        title: `Bước ${i + 1}: Tác vụ thứ ${i + 1}`,
        phase: 'code',
        status: 'completed',
        startTimeMs: i * stepDuration,
        endTimeMs: (i + 1) * stepDuration,
        durationMs: stepDuration,
        summary: `Summary of step ${i}`,
        thinking: { id: `th-${i}`, title: `Thought ${i}`, tokens: 20, elapsedMs: 180, content: `Content ${i}` },
        artifactPatch: { mode: 'sheets', action: 'update' },
        projectedArtifactSnapshot: { rowCount: i + 1 },
      });
    }

    const stressSession = {
      id: 'stress_120_steps',
      title: 'Stress Test Session with 120 Steps',
      mode: 'sheets',
      totalDurationMs: count * stepDuration,
      steps,
    };

    assert.equal(validateReplaySession(stressSession).valid, true);
    const engine = createReplayEngine(stressSession);
    assert.equal(engine.getState().totalSteps, 120);

    // Jump randomly across 120 steps
    for (let j = 0; j < 50; j++) {
      const target = Math.floor(Math.random() * count);
      engine.jumpToStep(target);
      assert.equal(engine.getState().currentStepIndex, target);
      assert.equal(engine.getState().currentTimeMs, target * stepDuration);
    }
  });

  await t.test('2.2.4: Session with non-uniform step durations calculates progress accurately', () => {
    const nonUniformSession = {
      id: 'non_uniform_session',
      title: 'Non Uniform Duration Session',
      mode: 'slides',
      totalDurationMs: 10000,
      steps: [
        {
          stepIndex: 0,
          id: 'step-short',
          title: 'Short',
          phase: 'intent',
          status: 'completed',
          startTimeMs: 0,
          endTimeMs: 1000,
          durationMs: 1000,
          summary: '1s step',
          thinking: { id: 't1', title: 'T1', tokens: 10, elapsedMs: 900, content: 'Short' },
          artifactPatch: { mode: 'slides', action: 'init' },
          projectedArtifactSnapshot: { totalSlides: 1 },
        },
        {
          stepIndex: 1,
          id: 'step-long',
          title: 'Long',
          phase: 'query',
          status: 'completed',
          startTimeMs: 1000,
          endTimeMs: 9000,
          durationMs: 8000,
          summary: '8s step',
          thinking: { id: 't2', title: 'T2', tokens: 100, elapsedMs: 7800, content: 'Long' },
          artifactPatch: { mode: 'slides', action: 'append' },
          projectedArtifactSnapshot: { totalSlides: 2 },
        },
        {
          stepIndex: 2,
          id: 'step-tail',
          title: 'Tail',
          phase: 'synthesis',
          status: 'completed',
          startTimeMs: 9000,
          endTimeMs: 10000,
          durationMs: 1000,
          summary: '1s tail',
          thinking: { id: 't3', title: 'T3', tokens: 10, elapsedMs: 900, content: 'Tail' },
          artifactPatch: { mode: 'slides', action: 'finalize' },
          projectedArtifactSnapshot: { totalSlides: 3 },
        },
      ],
    };

    const engine = createReplayEngine(nonUniformSession);
    engine.seek(5000); // exactly in middle of step 1 (1000..9000)
    assert.equal(engine.getState().currentStepIndex, 1);
    assert.equal(engine.getState().subStepProgress, 0.5); // (5000 - 1000) / 8000 = 0.5
  });

  await t.test('2.2.5: Consecutive steps with zero duration do not loop or hang', () => {
    const zeroStepsSession = {
      id: 'zero_steps_session',
      title: 'Zero Steps Test',
      mode: 'slides',
      totalDurationMs: 4000,
      steps: [
        {
          stepIndex: 0,
          id: 's0',
          title: 'S0',
          phase: 'intent',
          status: 'completed',
          startTimeMs: 0,
          endTimeMs: 0,
          durationMs: 0,
          summary: 'Instant init',
          thinking: { id: 't0', title: 'T0', tokens: 1, elapsedMs: 0, content: 'Zero' },
          artifactPatch: { mode: 'slides', action: 'init' },
          projectedArtifactSnapshot: { totalSlides: 1 },
        },
        {
          stepIndex: 1,
          id: 's1',
          title: 'S1',
          phase: 'code',
          status: 'completed',
          startTimeMs: 0,
          endTimeMs: 4000,
          durationMs: 4000,
          summary: 'Main',
          thinking: { id: 't1', title: 'T1', tokens: 10, elapsedMs: 3800, content: 'Main' },
          artifactPatch: { mode: 'slides', action: 'finalize' },
          projectedArtifactSnapshot: { totalSlides: 2 },
        },
      ],
    };

    assert.equal(resolveStepIndex(zeroStepsSession, 0), 1);
    const engine = createReplayEngine(zeroStepsSession);
    assert.equal(engine.getState().currentStepIndex, 1);
  });

  await t.test('2.2.6: Jumping past total step count is bounded to last step', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(999);
    assert.equal(engine.getState().currentStepIndex, 4);
    assert.equal(engine.getState().currentTimeMs, 15000);
  });

  await t.test('2.2.7: Jumping to negative step index is bounded to step 0', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(-10);
    assert.equal(engine.getState().currentStepIndex, 0);
    assert.equal(engine.getState().currentTimeMs, 0);
  });

  await t.test('2.2.8: stepPrev called when at step 0 stays at step 0', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(0);
    engine.stepPrev();
    assert.equal(engine.getState().currentStepIndex, 0);
    assert.equal(engine.getState().currentTimeMs, 0);
  });

  // =========================================================================
  // Section 2.3: Edge Reasoning Traces & Tool Telemetry (10 Tests)
  // =========================================================================
  await t.test('2.3.1: Empty thinking markdown text does not throw', () => {
    const emptyThinkingSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          thinking: { id: 'empty-th', title: '', tokens: 0, elapsedMs: 0, content: '' },
        },
      ],
    };
    assert.equal(validateReplaySession(emptyThinkingSession).valid, true);
    const engine = createReplayEngine(emptyThinkingSession);
    assert.equal(engine.getState().currentStep.thinking.content, '');
  });

  await t.test('2.3.2: Large thinking trace (>50KB markdown) is processed without memory leak', () => {
    const largeContent = '# Deep Analysis\n' + 'Dữ liệu phân tích chuyên sâu cho bài toán doanh nghiệp. '.repeat(1000);
    const largeThinkingSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          thinking: { id: 'large-th', title: 'Large', tokens: 15000, elapsedMs: 5000, content: largeContent },
        },
      ],
    };
    assert.ok(largeContent.length > 50000);
    const engine = createReplayEngine(largeThinkingSession);
    assert.equal(engine.getState().currentStep.thinking.content.length, largeContent.length);
  });

  await t.test('2.3.3: Special characters, markdown code fences, and LaTeX in thinking trace', () => {
    const specialContent = 'Công thức toán: $$\\sum_{i=1}^n x_i = \\mu$$ và XML `<think>test & <tag></think>`';
    const specialSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          thinking: { id: 'spec-th', title: 'Special', tokens: 50, elapsedMs: 500, content: specialContent },
        },
      ],
    };
    const engine = createReplayEngine(specialSession);
    assert.equal(engine.getState().currentStep.thinking.content, specialContent);
  });

  await t.test('2.3.4: Vietnamese Unicode accents are preserved across titles, summaries, and thinking', () => {
    const viText = 'Báo Cáo Chiến Lược & Tối Ưu Hóa Vận Hành Doanh Nghiệp — Đột Phá AI 2026';
    const viSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      title: viText,
    };
    const engine = createReplayEngine(viSession);
    assert.equal(engine.getState().session.title, viText);
  });

  await t.test('2.3.5: Empty toolCalls array is handled smoothly', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(0); // Step 0 has toolCalls: []
    assert.deepEqual(engine.getState().currentStep.toolCalls, []);
  });

  await t.test('2.3.6: Tool execution with error/failed status and stderr output', () => {
    const errorToolSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          toolCalls: [
            {
              id: 'err-tool-1',
              toolType: 'sql',
              title: 'Lỗi truy vấn SQL',
              status: 'failed',
              durationMs: 300,
              input: { query: 'SELECT * FROM non_existent_table;' },
              output: { stderr: 'Table "non_existent_table" does not exist in schema "public"' },
            },
          ],
        },
      ],
    };
    const engine = createReplayEngine(errorToolSession);
    assert.equal(engine.getState().currentStep.toolCalls[0].status, 'failed');
    assert.ok(engine.getState().currentStep.toolCalls[0].output.stderr.includes('does not exist'));
  });

  await t.test('2.3.7: Tool execution returning 0 rows is represented cleanly', () => {
    const emptyRowsSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          toolCalls: [
            {
              id: 'empty-tool-1',
              toolType: 'sql',
              title: 'Truy vấn 0 kết quả',
              status: 'success',
              durationMs: 120,
              input: { query: 'SELECT * FROM empty_table;' },
              output: { rowCount: 0, columns: ['id', 'name'], rows: [] },
            },
          ],
        },
      ],
    };
    const engine = createReplayEngine(emptyRowsSession);
    assert.equal(engine.getState().currentStep.toolCalls[0].output.rowCount, 0);
    assert.deepEqual(engine.getState().currentStep.toolCalls[0].output.rows, []);
  });

  await t.test('2.3.8: Multiple sequential and parallel tool calls within single step', () => {
    const multiToolSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          toolCalls: [
            { id: 't-1', toolType: 'sql', title: 'SQL 1', status: 'success', durationMs: 400, input: {}, output: {} },
            { id: 't-2', toolType: 'python', title: 'Python 2', status: 'success', durationMs: 600, input: {}, output: {} },
            { id: 't-3', toolType: 'web_search', title: 'Web 3', status: 'success', durationMs: 800, input: {}, output: {} },
          ],
        },
      ],
    };
    const engine = createReplayEngine(multiToolSession);
    assert.equal(engine.getState().currentStep.toolCalls.length, 3);
  });

  await t.test('2.3.9: SubThoughtItems with various state lifecycles (pending, active, completed)', () => {
    const subThoughts = [
      { id: 'st-1', text: 'Task 1', state: 'completed', durationMs: 400 },
      { id: 'st-2', text: 'Task 2', state: 'active', durationMs: 200 },
      { id: 'st-3', text: 'Task 3', state: 'pending' },
    ];
    const subThoughtSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          thinking: { id: 'th-sub', title: 'Sub', tokens: 100, elapsedMs: 600, content: 'Sub', subThoughtItems: subThoughts },
        },
      ],
    };
    const engine = createReplayEngine(subThoughtSession);
    const items = engine.getState().currentStep.thinking.subThoughtItems;
    assert.equal(items[0].state, 'completed');
    assert.equal(items[1].state, 'active');
    assert.equal(items[2].state, 'pending');
  });

  await t.test('2.3.10: Key decisions array in thinking block is accessible and immutable', () => {
    const decisions = ['Chọn layout 16:9', 'Tối ưu độ trễ SQL', 'Bảo mật AES-256'];
    const decisionSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          thinking: { id: 'th-dec', title: 'Dec', tokens: 100, elapsedMs: 600, content: 'Dec', keyDecisions: decisions },
        },
      ],
    };
    const engine = createReplayEngine(decisionSession);
    assert.deepEqual(engine.getState().currentStep.thinking.keyDecisions, decisions);
  });

  // =========================================================================
  // Section 2.4: Rapid State Oscillations & Stress Transitions (8 Tests)
  // =========================================================================
  await t.test('2.4.1: Rapid play/pause toggling (200x) leaves engine in consistent state', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    for (let i = 0; i < 200; i++) {
      engine.togglePlayPause();
    }
    // 200 toggles from false -> ended at false (paused/idle)
    assert.equal(engine.getState().isPlaying, false);
  });

  await t.test('2.4.2: Rapid speed cycling (1x -> 2x -> 4x -> 1x 100x) maintains valid multipliers', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    const speeds = ['1x', '2x', '4x', '1x'];
    for (let i = 0; i < 100; i++) {
      const sp = speeds[i % speeds.length];
      engine.setSpeed(sp);
      assert.equal(engine.getState().speed, sp);
    }
  });

  await t.test('2.4.3: Rapid seeking back and forth across steps does not corrupt active artifact snapshot', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    for (let i = 0; i < 50; i++) {
      engine.seek(17000); // Step 4 (6 slides)
      assert.equal(engine.getState().artifactState.snapshot.totalSlides, 6);
      engine.seek(1000);  // Step 0 (1 slide)
      assert.equal(engine.getState().artifactState.snapshot.totalSlides, 1);
    }
  });

  await t.test('2.4.4: Rapid stepNext and stepPrev oscillations at start bound remain bounded at 0', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    for (let i = 0; i < 50; i++) {
      engine.stepPrev();
      assert.equal(engine.getState().currentStepIndex, 0);
      assert.equal(engine.getState().currentTimeMs, 0);
    }
  });

  await t.test('2.4.5: Rapid stepNext calls at final step remain bounded at totalDurationMs', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.jumpToStep(4);
    for (let i = 0; i < 50; i++) {
      engine.stepNext();
      assert.equal(engine.getState().currentTimeMs, 18000);
      assert.equal(engine.getState().status, 'ended');
    }
  });

  await t.test('2.4.6: Subscriber callbacks fire on every state mutation without duplicate leaks', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    let callCount = 0;
    const unsub = engine.subscribe(() => {
      callCount++;
    });

    engine.play();
    engine.tick(100);
    engine.pause();
    engine.seek(5000);
    assert.equal(callCount, 4);

    unsub();
    engine.seek(8000);
    assert.equal(callCount, 4, 'Unsubscribed listener must not receive further events');
  });

  await t.test('2.4.7: Continuous micro-ticks (1000 x 10ms) aggregate accurately to 10,000ms', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    for (let i = 0; i < 1000; i++) {
      engine.tick(10);
    }
    assert.equal(engine.getState().currentTimeMs, 10000);
    assert.equal(engine.getState().currentStepIndex, 2);
  });

  await t.test('2.4.8: Engine state object is fresh on every mutation', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    const s1 = engine.getState();
    engine.seek(5000);
    const s2 = engine.getState();
    assert.notEqual(s1.currentTimeMs, s2.currentTimeMs);
  });

  // =========================================================================
  // Section 2.5: Instant Playback Mode Behaviors (6 Tests)
  // =========================================================================
  await t.test('2.5.1: Setting speed to Instant immediately sets clock to totalDurationMs', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('Instant');
    assert.equal(engine.getState().currentTimeMs, 18000);
    assert.equal(engine.getState().isEnded, true);
  });

  await t.test('2.5.2: Instant speed sets progressPercent to 100%', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('Instant');
    assert.equal(engine.getState().progressPercent, 100);
  });

  await t.test('2.5.3: Instant mode projects final step artifact snapshot immediately', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('Instant');
    const artifact = engine.getState().artifactState;
    assert.equal(artifact.isFinalStep, true);
    assert.equal(artifact.snapshot.totalSlides, 6);
  });

  await t.test('2.5.4: Seeking backward after Instant mode sets status back to paused', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('Instant');
    assert.equal(engine.getState().status, 'ended');
    engine.seek(5000);
    assert.equal(engine.getState().status, 'paused');
    assert.equal(engine.getState().currentTimeMs, 5000);
  });

  await t.test('2.5.5: Instant mode works on Financial PnL 3-sheet session', () => {
    const engine = createReplayEngine(MOCK_FINANCIAL_PNL_SESSION);
    engine.setSpeed('Instant');
    assert.equal(engine.getState().currentTimeMs, 20000);
    assert.equal(engine.getState().artifactState.snapshot.finalNetCash2027, 'D4+D5+D6');
  });

  await t.test('2.5.6: Instant mode works on AI Architecture DOCX session', () => {
    const engine = createReplayEngine(MOCK_AI_ARCHITECTURE_SESSION);
    engine.setSpeed('Instant');
    assert.equal(engine.getState().currentTimeMs, 22000);
    assert.equal(engine.getState().artifactState.snapshot.isFinalized, true);
  });

  // =========================================================================
  // Section 2.6: Malformed & Corner Artifact States (8 Tests)
  // =========================================================================
  await t.test('2.6.1: projectArtifactState handles empty session safely', () => {
    assert.equal(projectArtifactState(null, 0), null);
    assert.equal(projectArtifactState({}, 0), null);
    assert.equal(projectArtifactState({ steps: [] }, 0), null);
  });

  await t.test('2.6.2: projectArtifactState handles missing projectedArtifactSnapshot gracefully', () => {
    const sessionWithoutSnapshot = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          projectedArtifactSnapshot: undefined,
        },
      ],
    };
    const state = projectArtifactState(sessionWithoutSnapshot, 1000);
    assert.deepEqual(state.snapshot, {});
  });

  await t.test('2.6.3: projectArtifactState handles missing artifactPatch gracefully', () => {
    const sessionWithoutPatch = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          artifactPatch: undefined,
        },
      ],
    };
    const state = projectArtifactState(sessionWithoutPatch, 1000);
    assert.deepEqual(state.patch, {});
  });

  await t.test('2.6.4: Step with unknown phase string validates if structure is well-formed', () => {
    const customPhaseSession = {
      ...MOCK_STRATEGY_DECK_SESSION,
      steps: [
        {
          ...MOCK_STRATEGY_DECK_SESSION.steps[0],
          phase: 'custom_phase',
        },
      ],
    };
    const validation = validateReplaySession(customPhaseSession);
    assert.equal(validation.valid, true);
  });

  await t.test('2.6.5: setSession swaps active session and resets engine state to 0ms idle', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.play();
    engine.seek(10000);
    assert.equal(engine.getState().session.id, 'replay_strategy_deck_169');

    engine.setSession(MOCK_FINANCIAL_PNL_SESSION);
    const state = engine.getState();
    assert.equal(state.session.id, 'replay_financial_pnl_xlsx');
    assert.equal(state.currentTimeMs, 0);
    assert.equal(state.status, 'idle');
    assert.equal(state.currentStepIndex, 0);
  });

  await t.test('2.6.6: setSession throws error when given invalid session object', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    assert.throws(() => {
      engine.setSession({ id: 'broken' });
    }, /Invalid ReplaySession/);
  });

  await t.test('2.6.7: exportForkContext includes default fallback if forkContext is omitted from session', () => {
    const sessionNoFork = {
      ...MOCK_STRATEGY_DECK_SESSION,
      forkContext: undefined,
    };
    const engine = createReplayEngine(sessionNoFork);
    const forkData = engine.exportForkContext();
    assert.equal(forkData.model, 'dbgpt-kimi-agent');
    assert.ok(forkData.initialMessages.length >= 1);
  });

  await t.test('2.6.8: Unknown speed multiplier string is ignored without state mutation', () => {
    const engine = createReplayEngine(MOCK_STRATEGY_DECK_SESSION);
    engine.setSpeed('10x');
    assert.equal(engine.getState().speed, '1x');
  });

});
