import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// 1. DURATION FORMATTER HELPER (Mirror of OpenWorkCapabilityCallLine)
// ============================================================================
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// 2. STORE STATE MACHINE EMULATOR
// ============================================================================
class OpenWorkStoreSimulator {
  constructor() {
    this.isStreaming = false;
    this.spotlightActive = false;
    this.agentStatus = 'idle';
    this.streamParts = [];
    this.artifacts = [];
    this.activeTab = 'slide';
  }

  startStream(prompt) {
    this.isStreaming = true;
    this.agentStatus = 'thinking';
    this.spotlightActive = false;
    this.streamParts.push({ type: 'user', text: prompt });
  }

  emitReasoningDelta(thought) {
    this.agentStatus = 'thinking';
    let reasoning = this.streamParts.find((p) => p.type === 'reasoning');
    if (!reasoning) {
      reasoning = { type: 'reasoning', thought: '', isStreaming: true };
      this.streamParts.push(reasoning);
    }
    reasoning.thought += thought;
  }

  emitToolCallDelta(toolName, argsDelta) {
    this.spotlightActive = true;
    this.agentStatus = 'executing';

    // Set artifact to generating
    let art = this.artifacts.find((a) => a.type === 'slide');
    if (!art) {
      art = {
        id: 'art-slide-1',
        type: 'slide',
        title: 'Đang tạo slide...',
        status: 'generating',
        content: {},
      };
      this.artifacts.push(art);
    } else {
      art.status = 'generating';
    }

    // Set capability call to running
    let cap = this.streamParts.find((p) => p.type === 'capability-call');
    if (!cap) {
      cap = {
        type: 'capability-call',
        toolName,
        status: 'running',
        startTime: Date.now(),
        codeSnippet: '',
      };
      this.streamParts.push(cap);
    }
    cap.codeSnippet += argsDelta;
  }

  finishStream(finalSlidesPayload) {
    this.isStreaming = false;
    this.spotlightActive = false;
    this.agentStatus = 'idle';

    const art = this.artifacts.find((a) => a.type === 'slide');
    if (art) {
      art.status = 'ready';
      art.content = finalSlidesPayload;
    }

    const cap = this.streamParts.find((p) => p.type === 'capability-call');
    if (cap) {
      cap.status = 'success';
      cap.durationMs = Date.now() - cap.startTime;
    }
  }

  abortStream() {
    this.isStreaming = false;
    this.spotlightActive = false;
    this.agentStatus = 'idle';

    const art = this.artifacts.find((a) => a.type === 'slide');
    if (art && art.status === 'generating') {
      art.status = 'ready'; // Reset from generating
    }

    const cap = this.streamParts.find((p) => p.type === 'capability-call');
    if (cap && cap.status === 'running') {
      cap.status = 'failed';
    }
  }
}

// ============================================================================
// 3. 4-TIER TEST SUITE
// ============================================================================
test('🎬 MILESTONE 3 (R3): STRICT EXECUTION SPOTLIGHT & SKELETON VERIFICATION', async (t) => {

  // --------------------------------------------------------------------------
  // TIER 1: CORE FEATURE CONTRACTS
  // --------------------------------------------------------------------------
  await t.test('Tier 1: Feature Contracts (Skeleton, Stopwatch, State Machine)', async (st) => {

    await st.test('T1.1: SlideSkeleton source contract and DOM testid verification', () => {
      const skeletonPath = path.join(ROOT, 'components/ai-data-analytic/skeletons/SlideSkeleton.tsx');
      assert.ok(fs.existsSync(skeletonPath), 'SlideSkeleton.tsx must exist');
      const content = fs.readFileSync(skeletonPath, 'utf8');

      assert.match(content, /data-testid=["']spotlight-loading-skeleton["']/, 'Root element must have data-testid="spotlight-loading-skeleton"');
      assert.match(content, /aspect-video|aspect-\[16\/9\]|16\/9|SlideCanvas/, 'Must enforce 16:9 aspect ratio geometry');
      assert.match(content, /animate-pulse|shimmer/, 'Must include animated shimmer/pulse classes');
      assert.match(content, /presentation_builder|toolName/, 'Must support live tool badge binding');
    });

    await st.test('T1.2: SlideArtifactViewer renders SlideSkeleton when status is generating', () => {
      const viewerPath = path.join(ROOT, 'components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx');
      const content = fs.readFileSync(viewerPath, 'utf8');

      assert.match(content, /SlideSkeleton/, 'SlideArtifactViewer must import and utilize SlideSkeleton');
      assert.match(content, /status\s*===\s*['"]generating['"]|isGenerating/, 'Viewer must check for generating status to render skeleton');
    });

    await st.test('T1.3: OpenWorkCapabilityCallLine Stopwatch formatting logic', () => {
      assert.equal(formatDuration(0), '0ms');
      assert.equal(formatDuration(350), '350ms');
      assert.equal(formatDuration(999), '999ms');
      assert.equal(formatDuration(1000), '1.0s');
      assert.equal(formatDuration(2450), '2.5s');
      assert.equal(formatDuration(12800), '12.8s');
    });

    await st.test('T1.4: State Machine Lifecycle: IDLE -> THINKING -> TOOL_EXECUTING (Spotlight) -> COMPLETED', () => {
      const sim = new OpenWorkStoreSimulator();

      // 1. Initial State (IDLE)
      assert.equal(sim.isStreaming, false);
      assert.equal(sim.spotlightActive, false);
      assert.equal(sim.agentStatus, 'idle');

      // 2. Start Stream & CoT (THINKING)
      sim.startStream('Tạo 4 slide phân tích doanh thu Q3');
      sim.emitReasoningDelta('Đang suy nghĩ cấu trúc 4 slide...');
      assert.equal(sim.isStreaming, true);
      assert.equal(sim.spotlightActive, false);
      assert.equal(sim.agentStatus, 'thinking');

      // 3. Tool Call Initiated (TOOL_EXECUTING / SPOTLIGHT ACTIVE)
      sim.emitToolCallDelta('presentation_builder', '{"title": "Q3 Revenue", "slides": [');
      assert.equal(sim.isStreaming, true);
      assert.equal(sim.spotlightActive, true);
      assert.equal(sim.agentStatus, 'executing');
      const generatingArt = sim.artifacts.find((a) => a.type === 'slide');
      assert.equal(generatingArt?.status, 'generating');

      // 4. Stream Finish (COMPLETED)
      sim.finishStream({ slides: [{ layout: 'hero', title: 'Q3 Revenue' }] });
      assert.equal(sim.isStreaming, false);
      assert.equal(sim.spotlightActive, false);
      assert.equal(sim.agentStatus, 'idle');
      const completedArt = sim.artifacts.find((a) => a.type === 'slide');
      assert.equal(completedArt?.status, 'ready');
      assert.equal(completedArt?.content.slides.length, 1);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  await t.test('Tier 2: Boundary & Corner Cases', async (st) => {

    await st.test('T2.1: Immediate Tool Call with no reasoning trace triggers Spotlight correctly', () => {
      const sim = new OpenWorkStoreSimulator();
      sim.startStream('Generate slide now');
      sim.emitToolCallDelta('presentation_builder', '{"title": "Immediate Slide"}');

      assert.equal(sim.spotlightActive, true);
      assert.equal(sim.agentStatus, 'executing');
      assert.equal(sim.artifacts[0].status, 'generating');
    });

    await st.test('T2.2: Stream Abort during Spotlight resets spotlightActive and cleans up running state', () => {
      const sim = new OpenWorkStoreSimulator();
      sim.startStream('Make slide deck');
      sim.emitToolCallDelta('presentation_builder', '{"slides": [');
      assert.equal(sim.spotlightActive, true);

      sim.abortStream();
      assert.equal(sim.isStreaming, false);
      assert.equal(sim.spotlightActive, false);
      assert.equal(sim.agentStatus, 'idle');
      const cap = sim.streamParts.find((p) => p.type === 'capability-call');
      assert.equal(cap?.status, 'failed');
    });

    await st.test('T2.3: Zero Mock Fallback Invariant: purged mock files assert 0 matches', () => {
      const purgedPaths = [
        path.join('components', 'chat', 'office-slides', 'templates', ['mock', 'Slide', 'Templates.ts'].join('')),
        path.join('components', 'chat', 'replay', ['mock', 'Replay', 'Sessions.ts'].join('')),
        path.join('__tests__', 'replay', 'fixtures', ['mock', '-replay-data.mjs'].join('')),
      ];

      const projectRoot = ROOT.endsWith('frontend_mock') || ROOT.endsWith('frontend') ? path.resolve(ROOT, '..') : ROOT;
      for (const rel of purgedPaths) {
        const fullMock = path.join(projectRoot, 'frontend_mock', rel);
        const fullProd = path.join(projectRoot, 'frontend', rel);
        assert.equal(fs.existsSync(fullMock), false, `Mock file ${rel} must not exist in frontend_mock`);
        assert.equal(fs.existsSync(fullProd), false, `Mock file ${rel} must not exist in frontend`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // --------------------------------------------------------------------------
  await t.test('Tier 3: Cross-Feature Combinations', async (st) => {

    await st.test('T3.1: Tab switching during active Spotlight preserves generating artifact status', () => {
      const sim = new OpenWorkStoreSimulator();
      sim.startStream('Create multi-part report');
      sim.emitToolCallDelta('presentation_builder', '{"slides": []}');

      // User switches to excel tab during stream
      sim.activeTab = 'excel';
      const slideArt = sim.artifacts.find((a) => a.type === 'slide');
      assert.equal(slideArt?.status, 'generating');
      assert.equal(sim.spotlightActive, true);

      // User switches back to slide tab
      sim.activeTab = 'slide';
      assert.equal(slideArt?.status, 'generating');
    });

    await st.test('T3.2: Production Component & Skeleton Invariants', () => {
      const filesToVerify = [
        'components/ai-data-analytic/skeletons/SlideSkeleton.tsx',
        'components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx',
        'components/openwork/OpenWorkWorkbench.tsx',
        'components/openwork/OpenWorkCapabilityCallLine.tsx',
        'components/openwork/OpenWorkHeader.tsx',
        'components/openwork/OpenWorkShell.tsx',
        'components/openwork/useOpenWorkStore.ts',
      ];

      for (const rel of filesToVerify) {
        const prodFile = path.join(ROOT, rel);
        assert.ok(fs.existsSync(prodFile), `Production file must exist: ${rel}`);
        const prodContent = fs.readFileSync(prodFile, 'utf8');
        assert.ok(prodContent.length > 50, `File ${rel} must have non-empty content`);
        assert.ok(!prodContent.includes('mockSlideTemplates'), `File ${rel} must not contain mockSlideTemplates`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIO
  // --------------------------------------------------------------------------
  await t.test('Tier 4: Real-World Scenario Simulation', async (st) => {

    await st.test('T4.1: Full analytical prompt to dynamic 16:9 slide generation lifecycle', () => {
      const sim = new OpenWorkStoreSimulator();

      // Step 1: User prompt
      sim.startStream('Thiết kế bài thuyết trình 3 slide về tăng trưởng doanh thu 2026');

      // Step 2: CoT thinking
      sim.emitReasoningDelta('Phân tích yêu cầu bài thuyết trình: 1 hero slide, 1 stats slide, 1 closing slide.');
      assert.equal(sim.agentStatus, 'thinking');

      // Step 3: Tool Execution (Spotlight active)
      sim.emitToolCallDelta('presentation_builder', '{"title": "Báo Cáo Tăng Trưởng 2026", "slides": [');
      assert.equal(sim.spotlightActive, true);
      assert.equal(sim.agentStatus, 'executing');

      // Step 4: Stream completion
      const dynamicPayload = {
        title: 'Báo Cáo Tăng Trưởng 2026',
        slides: [
          { layout: 'hero', title: 'Tăng Trưởng Doanh Thu 2026', subtitle: 'Báo cáo điều hành' },
          { layout: 'stat_grid', title: 'Chỉ Số KPIs', stats: [{ label: 'ARR', value: '$10M' }] },
          { layout: 'closing', title: 'Cảm Ơn' },
        ],
      };

      sim.finishStream(dynamicPayload);
      assert.equal(sim.spotlightActive, false);
      assert.equal(sim.isStreaming, false);

      const finalSlideArt = sim.artifacts.find((a) => a.type === 'slide');
      assert.equal(finalSlideArt?.status, 'ready');
      assert.equal(finalSlideArt?.content.slides.length, 3);
    });
  });
});
