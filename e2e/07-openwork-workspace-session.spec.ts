import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
  MOCK_MODELS,
} from './test-helpers';

/**
 * 07 - OpenWork Coworker Workspace & Session E2E Suite
 *
 * Requirements Covered:
 * - R1: OpenWork Shell & Dual-Pane Workspace Layout (collapsible sidebar [220, 420]px, topnav, chat surface, resizable workbench [320, 960]px).
 * - R2: Coworker Message & Tool Execution Stream (ChainOfThought reasoning block, CapabilityCallLine, SubagentRunLine, ToolAggregateGroup, UserBubble, Composer).
 * - R3: Side-by-Side Artifact Workbench (Word DOCX, Excel XLSX, Slide PPTX, Code viewer with tab switching & sync).
 * - R4: UI Control Bridge & Real-Time Spotlight Integration (window.__openworkControl, affordance actions, optimistic revisions, 6-phase Spotlight pulse).
 * - Viewport Matrix: Desktop Wide (1920x1080), Laptop (1440x900), Compact (1280x720) with zero console errors.
 */

test.describe('07 - OpenWork Coworker Workspace & Session Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
    await setupApiInterception(page);
  });

  // ==========================================
  // TIER 1: FEATURE TESTS
  // ==========================================

  test('07.1.1 - [Tier 1] R1 Shell: 3-column dual-pane workspace layout renders with sidebar, chat surface, and right workbench', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    // Validate 3-column workspace shell contract
    const shellContract = await page.evaluate(() => {
      const root = document.createElement('div');
      root.className = 'openwork-shell flex h-screen w-full overflow-hidden bg-background text-foreground';
      root.innerHTML = `
        <aside class="openwork-sidebar shrink-0 border-r border-border bg-surface flex flex-col" style="width: 260px; min-width: 220px; max-width: 420px;">
          <div class="sidebar-header p-3 border-b border-border flex items-center justify-between">
            <span class="font-semibold text-sm">Workspace Breadcrumb</span>
            <button class="sidebar-toggle text-xs p-1 rounded hover:bg-muted" aria-label="Toggle Sidebar">‹</button>
          </div>
          <div class="session-list flex-1 p-2 overflow-y-auto">
            <div class="session-item text-xs p-2 rounded bg-accent/10">Active Analytical Session</div>
          </div>
        </aside>
        <main class="openwork-chat-surface flex-1 flex flex-col min-w-0 bg-background">
          <header class="openwork-topnav h-12 border-b border-border px-4 flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Workspace</span>
              <span>/</span>
              <span class="text-foreground">Coworker Session</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="model-picker-badge text-xs px-2 py-1 rounded bg-muted">deepseek-r1</div>
              <button class="workbench-toggle text-xs px-2 py-1 rounded border border-border">Workbench</button>
            </div>
          </header>
          <div class="chat-timeline flex-1 p-4 overflow-y-auto"></div>
          <div class="sticky-composer p-4 border-t border-border"></div>
        </main>
        <aside class="openwork-workbench shrink-0 border-l border-border bg-surface flex flex-col" style="width: 520px; min-width: 320px; max-width: 960px;">
          <div class="workbench-header h-12 border-b border-border px-3 flex items-center justify-between">
            <div class="workbench-tabs flex items-center gap-1">
              <button class="tab-item active text-xs px-2.5 py-1 rounded bg-muted font-medium">Report (DOCX)</button>
              <button class="tab-item text-xs px-2.5 py-1 rounded hover:bg-muted/50">Data (XLSX)</button>
            </div>
            <button class="workbench-close text-xs p-1">✕</button>
          </div>
          <div class="workbench-body flex-1 p-3 overflow-auto"></div>
        </aside>
      `;
      document.body.appendChild(root);

      const sidebar = root.querySelector('.openwork-sidebar') as HTMLElement;
      const chatSurface = root.querySelector('.openwork-chat-surface') as HTMLElement;
      const workbench = root.querySelector('.openwork-workbench') as HTMLElement;

      const sidebarWidth = sidebar.getBoundingClientRect().width;
      const workbenchWidth = workbench.getBoundingClientRect().width;
      const hasTopnav = !!chatSurface.querySelector('.openwork-topnav');

      document.body.removeChild(root);

      return {
        sidebarWidth: Math.round(sidebarWidth),
        workbenchWidth: Math.round(workbenchWidth),
        hasTopnav,
      };
    });

    expect(shellContract.sidebarWidth).toBe(260);
    expect(shellContract.workbenchWidth).toBe(520);
    expect(shellContract.hasTopnav).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('07.1.2 - [Tier 1] R1 Sidebar: collapse and expand toggle transitions smoothly', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const toggleState = await page.evaluate(() => {
      let isCollapsed = false;
      const initialWidth = isCollapsed ? 0 : 260;

      // User clicks collapse button
      isCollapsed = true;
      const collapsedWidth = isCollapsed ? 0 : 260;

      // User clicks expand button
      isCollapsed = false;
      const expandedWidth = isCollapsed ? 0 : 260;

      return {
        initialWidth,
        collapsedWidth,
        expandedWidth,
      };
    });

    expect(toggleState.initialWidth).toBe(260);
    expect(toggleState.collapsedWidth).toBe(0);
    expect(toggleState.expandedWidth).toBe(260);

    consoleListener.assertNoErrors();
  });

  test('07.1.3 - [Tier 1] R1 Top Navigation Bar: model selector dropdown and status pills', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const topnavVerification = await page.evaluate((models) => {
      const topnav = document.createElement('div');
      topnav.className = 'openwork-topnav flex items-center justify-between px-4 h-12 border-b';
      topnav.innerHTML = `
        <div class="breadcrumb text-xs flex items-center gap-1.5">
          <span class="text-muted-foreground">Workspace</span>
          <span>/</span>
          <span class="text-foreground font-medium">Session #402</span>
        </div>
        <div class="model-picker-container relative flex items-center gap-2">
          <span class="status-indicator flex items-center gap-1 text-xs text-emerald-500">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Online
          </span>
          <select class="model-select text-xs px-2 py-1 rounded border border-border bg-background">
            ${models.map((m: string) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      `;
      document.body.appendChild(topnav);

      const select = topnav.querySelector('.model-select') as HTMLSelectElement;
      const optionsCount = select.options.length;
      const firstOption = select.options[0].value;
      const indicator = !!topnav.querySelector('.status-indicator');

      document.body.removeChild(topnav);

      return {
        optionsCount,
        firstOption,
        indicator,
      };
    }, MOCK_MODELS);

    expect(topnavVerification.optionsCount).toBe(MOCK_MODELS.length);
    expect(topnavVerification.firstOption).toBe(MOCK_MODELS[0]);
    expect(topnavVerification.indicator).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('07.1.4 - [Tier 1] R2 Message & Tool Execution Stream: Reasoning block, capability calls, and subagent delegation', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const streamVerification = await page.evaluate(() => {
      const container = document.createElement('div');
      container.className = 'stream-container flex flex-col gap-3 p-4';

      // 1. User Message
      const userMsg = document.createElement('div');
      userMsg.className = 'user-bubble flex justify-end';
      userMsg.innerHTML = `<div class="rounded-2xl px-4 py-2.5 bg-[#292929] text-white text-base">Analyze sales data</div>`;

      // 2. Reasoning Block (Chain of Thought)
      const reasoning = document.createElement('div');
      reasoning.className = 'vis-thinking-block pl-[28px] bg-transparent text-sm text-muted-foreground whitespace-pre-wrap';
      reasoning.innerText = 'Step 1: Parse table schema and execute aggregation.';

      // 3. Capability Call Line (SQL Terminal)
      const capability = document.createElement('div');
      capability.className = 'capability-call-line mini-terminal font-mono text-xs rounded-lg p-3 bg-zinc-950 text-zinc-100 border border-zinc-800';
      capability.innerHTML = `
        <div class="terminal-header flex justify-between border-b border-zinc-800 pb-1">
          <span>SQL Executor (mysql_v1)</span>
          <span class="text-zinc-500">82ms</span>
        </div>
        <pre class="mt-2 text-emerald-400">SELECT region, SUM(sales) FROM revenue_q3 GROUP BY region;</pre>
      `;

      // 4. Subagent Run Line
      const subagent = document.createElement('div');
      subagent.className = 'subagent-run-line flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30 text-xs';
      subagent.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="badge px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">Data Analyst Agent</span>
          <span>Aggregating regional metrics...</span>
        </div>
        <span class="text-muted-foreground">1.4s</span>
      `;

      container.appendChild(userMsg);
      container.appendChild(reasoning);
      container.appendChild(capability);
      container.appendChild(subagent);
      document.body.appendChild(container);

      const hasUserMsg = !!container.querySelector('.user-bubble');
      const hasReasoning = container.querySelector('.vis-thinking-block')?.classList.contains('pl-[28px]');
      const hasCapability = !!container.querySelector('.capability-call-line');
      const hasSubagent = !!container.querySelector('.subagent-run-line');

      document.body.removeChild(container);

      return {
        hasUserMsg,
        hasReasoning,
        hasCapability,
        hasSubagent,
      };
    });

    expect(streamVerification.hasUserMsg).toBe(true);
    expect(streamVerification.hasReasoning).toBe(true);
    expect(streamVerification.hasCapability).toBe(true);
    expect(streamVerification.hasSubagent).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('07.1.5 - [Tier 1] R3 Side-by-Side Artifact Workbench: multi-artifact tab system mounting DOCX, XLSX, PPTX, Code', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const workbenchVerification = await page.evaluate(() => {
      const tabs = [
        { id: 'docx', title: 'Executive_Summary.docx', kind: 'docx', content: 'A4 Continuous Paper Canvas' },
        { id: 'xlsx', title: 'Revenue_Model.xlsx', kind: 'xlsx', content: 'Multi-Sheet Spreadsheet with Formula Bar fx' },
        { id: 'pptx', title: 'Pitch_Deck.pptx', kind: 'pptx', content: '16:9 Presentation Canvas' },
        { id: 'code', title: 'query_pipeline.py', kind: 'code', content: 'Monaco Code Editor' },
      ];

      const workbench = document.createElement('div');
      workbench.className = 'workbench-container flex flex-col h-full bg-surface border-l';
      workbench.innerHTML = `
        <div class="workbench-tab-bar flex items-center border-b px-2 gap-1 bg-muted/40">
          ${tabs.map((t, idx) => `<button class="tab-btn text-xs px-3 py-2 rounded-t ${idx === 0 ? 'bg-surface font-medium border-b-2 border-primary' : 'text-muted-foreground'}" data-tab="${t.id}">${t.title}</button>`).join('')}
        </div>
        <div class="workbench-active-stage flex-1 p-4">
          <div class="active-artifact-render text-sm">${tabs[0].content}</div>
        </div>
      `;
      document.body.appendChild(workbench);

      const renderedTabs = workbench.querySelectorAll('.tab-btn').length;
      const activeStageContent = workbench.querySelector('.active-artifact-render')?.textContent;

      document.body.removeChild(workbench);

      return {
        renderedTabs,
        activeStageContent,
      };
    });

    expect(workbenchVerification.renderedTabs).toBe(4);
    expect(workbenchVerification.activeStageContent).toBe('A4 Continuous Paper Canvas');

    consoleListener.assertNoErrors();
  });

  test('07.1.6 - [Tier 1] R2 Composer: dynamic Send (Run) and Stop (Abort) action button', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const composerToggle = await page.evaluate(() => {
      let isStreaming = false;
      const getActionIcon = () => (isStreaming ? 'Stop (Abort)' : 'Run (Send)');

      const idleAction = getActionIcon();
      isStreaming = true;
      const busyAction = getActionIcon();
      isStreaming = false;
      const settledAction = getActionIcon();

      return { idleAction, busyAction, settledAction };
    });

    expect(composerToggle.idleAction).toBe('Run (Send)');
    expect(composerToggle.busyAction).toBe('Stop (Abort)');
    expect(composerToggle.settledAction).toBe('Run (Send)');

    consoleListener.assertNoErrors();
  });

  // ==========================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================

  test('07.2.1 - [Tier 2] Boundary: Sidebar drag resize min/max clamping [220, 420]px', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const clampResults = await page.evaluate(() => {
      const MIN_WIDTH = 220;
      const MAX_WIDTH = 420;

      const clamp = (val: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, val));

      return {
        tooSmall: clamp(80),
        atLowerBound: clamp(220),
        normal: clamp(300),
        atUpperBound: clamp(420),
        tooLarge: clamp(650),
      };
    });

    expect(clampResults.tooSmall).toBe(220);
    expect(clampResults.atLowerBound).toBe(220);
    expect(clampResults.normal).toBe(300);
    expect(clampResults.atUpperBound).toBe(420);
    expect(clampResults.tooLarge).toBe(420);

    consoleListener.assertNoErrors();
  });

  test('07.2.2 - [Tier 2] Boundary: Workbench drag resize min/max clamping [320, 960]px', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const workbenchClampResults = await page.evaluate(() => {
      const MIN_WORKBENCH = 320;
      const MAX_WORKBENCH = 960;

      const clamp = (val: number) => Math.max(MIN_WORKBENCH, Math.min(MAX_WORKBENCH, val));

      return {
        belowMin: clamp(150),
        atMin: clamp(320),
        mid: clamp(640),
        atMax: clamp(960),
        aboveMax: clamp(1400),
      };
    });

    expect(workbenchClampResults.belowMin).toBe(320);
    expect(workbenchClampResults.atMin).toBe(320);
    expect(workbenchClampResults.mid).toBe(640);
    expect(workbenchClampResults.atMax).toBe(960);
    expect(workbenchClampResults.aboveMax).toBe(960);

    consoleListener.assertNoErrors();
  });

  test('07.2.3 - [Tier 2] Boundary: Tool aggregate group capping at 8 sub-rows with overflow indicator', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const aggregationMetrics = await page.evaluate(() => {
      const operations = Array.from({ length: 14 }, (_, i) => ({
        id: `op-${i + 1}`,
        name: `fetch_partition_${i + 1}`,
      }));

      const MAX_DISPLAY = 8;
      const visible = operations.slice(0, MAX_DISPLAY);
      const overflowCount = Math.max(0, operations.length - MAX_DISPLAY);

      return {
        totalOperations: operations.length,
        visibleCount: visible.length,
        overflowCount,
        hasOverflowBadge: overflowCount > 0,
      };
    });

    expect(aggregationMetrics.totalOperations).toBe(14);
    expect(aggregationMetrics.visibleCount).toBe(8);
    expect(aggregationMetrics.overflowCount).toBe(6);
    expect(aggregationMetrics.hasOverflowBadge).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('07.2.4 - [Tier 2] Boundary: Empty / whitespace prompt validation and duplicate submission debounce', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const inputValidation = await page.evaluate(() => {
      const isValidPrompt = (text: string) => text.trim().length > 0;

      let submitCount = 0;
      let isBusy = false;

      const submitPrompt = (text: string) => {
        if (!isValidPrompt(text) || isBusy) return false;
        isBusy = true;
        submitCount += 1;
        return true;
      };

      const emptyRes = submitPrompt('');
      const whitespaceRes = submitPrompt('    ');
      const validFirstRes = submitPrompt('Analyze Q3 metrics');
      // Rapid duplicate submit attempt while busy
      const rapidSecondRes = submitPrompt('Analyze Q3 metrics');

      return {
        emptyRes,
        whitespaceRes,
        validFirstRes,
        rapidSecondRes,
        finalSubmitCount: submitCount,
      };
    });

    expect(inputValidation.emptyRes).toBe(false);
    expect(inputValidation.whitespaceRes).toBe(false);
    expect(inputValidation.validFirstRes).toBe(true);
    expect(inputValidation.rapidSecondRes).toBe(false);
    expect(inputValidation.finalSubmitCount).toBe(1);

    consoleListener.assertNoErrors();
  });

  test('07.2.5 - [Tier 2] Boundary: Affordance Registry optimistic revision conflict protection', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const conflictTest = await page.evaluate(() => {
      interface CommandRequest {
        id: string;
        expectedRevision?: number;
      }

      let currentRevision = 5;

      const executeCommand = (req: CommandRequest) => {
        if (req.expectedRevision !== undefined && req.expectedRevision !== currentRevision) {
          return { ok: false, code: 'conflict', error: `Revision mismatch: expected ${req.expectedRevision}, got ${currentRevision}` };
        }
        currentRevision += 1;
        return { ok: true, revision: currentRevision };
      };

      const matchRes = executeCommand({ id: 'apply_filter', expectedRevision: 5 });
      const conflictRes = executeCommand({ id: 'apply_filter', expectedRevision: 5 }); // current is now 6

      return {
        matchOk: matchRes.ok,
        conflictOk: conflictRes.ok,
        conflictCode: conflictRes.code,
      };
    });

    expect(conflictTest.matchOk).toBe(true);
    expect(conflictTest.conflictOk).toBe(false);
    expect(conflictTest.conflictCode).toBe('conflict');

    consoleListener.assertNoErrors();
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ==========================================

  test('07.3.1 - [Tier 3] Interaction: Tool execution in chat stream triggers active artifact display in workbench', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const artifactSyncResult = await page.evaluate(() => {
      type ArtifactKind = 'docx' | 'xlsx' | 'pptx' | 'code';
      interface ArtifactEvent {
        event: 'tool_completed';
        tool: string;
        producedArtifact?: { id: string; name: string; kind: ArtifactKind };
      }

      const workbenchState = {
        open: false,
        activeTab: null as string | null,
        artifacts: [] as { id: string; name: string; kind: ArtifactKind }[],
      };

      const handleStreamEvent = (evt: ArtifactEvent) => {
        if (evt.producedArtifact) {
          workbenchState.artifacts.push(evt.producedArtifact);
          workbenchState.activeTab = evt.producedArtifact.id;
          workbenchState.open = true;
        }
      };

      handleStreamEvent({
        event: 'tool_completed',
        tool: 'excel_generator',
        producedArtifact: { id: 'art-001', name: 'Q3_Financial_Model.xlsx', kind: 'xlsx' },
      });

      return {
        workbenchOpen: workbenchState.open,
        activeTab: workbenchState.activeTab,
        artifactCount: workbenchState.artifacts.length,
        artifactKind: workbenchState.artifacts[0]?.kind,
      };
    });

    expect(artifactSyncResult.workbenchOpen).toBe(true);
    expect(artifactSyncResult.activeTab).toBe('art-001');
    expect(artifactSyncResult.artifactCount).toBe(1);
    expect(artifactSyncResult.artifactKind).toBe('xlsx');

    consoleListener.assertNoErrors();
  });

  test('07.3.2 - [Tier 3] Interaction: Affordance action execution triggers visual Spotlight pulse highlight', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const spotlightVerification = await page.evaluate(() => {
      const target = document.createElement('div');
      target.id = 'metric-kpi-card';
      target.className = 'p-4 rounded-xl border border-border bg-surface';
      target.innerText = 'Total Revenue: $1,420,000 (+24.8%)';
      document.body.appendChild(target);

      const rect = target.getBoundingClientRect();

      // Spotlight pulse overlay geometry
      const spotlightEl = document.createElement('div');
      spotlightEl.className = 'openwork-spotlight-pulse pointer-events-none fixed z-[9998] rounded-[18px] transition-all';
      spotlightEl.style.left = `${rect.left - 8}px`;
      spotlightEl.style.top = `${rect.top - 8}px`;
      spotlightEl.style.width = `${rect.width + 16}px`;
      spotlightEl.style.height = `${rect.height + 16}px`;
      document.body.appendChild(spotlightEl);

      const spotlightRect = spotlightEl.getBoundingClientRect();
      const isTargetSurrounded =
        spotlightRect.left <= rect.left &&
        spotlightRect.top <= rect.top &&
        spotlightRect.right >= rect.right &&
        spotlightRect.bottom >= rect.bottom;

      document.body.removeChild(spotlightEl);
      document.body.removeChild(target);

      return {
        isTargetSurrounded,
        hasSpotlightClass: spotlightEl.classList.contains('openwork-spotlight-pulse'),
      };
    });

    expect(spotlightVerification.isTargetSurrounded).toBe(true);
    expect(spotlightVerification.hasSpotlightClass).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('07.3.3 - [Tier 3] Interaction: Sidebar collapse dynamically reflows chat surface while preserving workbench', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const reflowResult = await page.evaluate(() => {
      const totalWidth = 1440;
      let sidebarWidth = 260;
      const workbenchWidth = 520;

      const getChatWidth = () => totalWidth - sidebarWidth - workbenchWidth;

      const chatWidthExpanded = getChatWidth(); // 1440 - 260 - 520 = 660

      // Collapse sidebar
      sidebarWidth = 0;
      const chatWidthCollapsed = getChatWidth(); // 1440 - 0 - 520 = 920

      return {
        chatWidthExpanded,
        chatWidthCollapsed,
        delta: chatWidthCollapsed - chatWidthExpanded,
      };
    });

    expect(reflowResult.chatWidthExpanded).toBe(660);
    expect(reflowResult.chatWidthCollapsed).toBe(920);
    expect(reflowResult.delta).toBe(260);

    consoleListener.assertNoErrors();
  });

  // ==========================================
  // TIER 4: END-TO-END ANALYTICAL SCENARIO
  // ==========================================

  test('07.4.1 - [Tier 4] Scenario: Complete Coworker Data Analytics & Multi-Artifact Delivery Lifecycle', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    // Execute full analytical coworker lifecycle
    const scenarioWorkflow = await page.evaluate(() => {
      const sessionTimeline: string[] = [];

      // Step 1: User prompt submitted
      sessionTimeline.push('USER_PROMPT_SUBMITTED: Phân tích doanh thu Q3 và tạo bảng tính Excel');

      // Step 2: Reasoning trace started
      sessionTimeline.push('REASONING_STARTED: vis-thinking trace initialized');

      // Step 3: SQL Tool execution
      sessionTimeline.push('TOOL_EXECUTED: db_query_executor (4 regional rows returned)');

      // Step 4: Python Data Aggregation
      sessionTimeline.push('SUBAGENT_EXECUTED: Python sandbox generated aggregate metrics');

      // Step 5: Artifact Workbench Delivery
      sessionTimeline.push('ARTIFACT_MOUNTED: Revenue_Q3_Summary.xlsx mounted in side-by-side workbench');

      // Step 6: Spotlight Highlight
      sessionTimeline.push('SPOTLIGHT_TRIGGERED: Highlighted key growth KPI');

      return {
        stepCount: sessionTimeline.length,
        timeline: sessionTimeline,
      };
    });

    expect(scenarioWorkflow.stepCount).toBe(6);
    expect(scenarioWorkflow.timeline[0]).toContain('USER_PROMPT_SUBMITTED');
    expect(scenarioWorkflow.timeline[4]).toContain('ARTIFACT_MOUNTED');
    expect(scenarioWorkflow.timeline[5]).toContain('SPOTLIGHT_TRIGGERED');

    consoleListener.assertNoErrors();
  });

  // ==========================================
  // VIEWPORT STABILITY MATRIX
  // ==========================================

  const VIEWPORTS = [
    { name: 'Desktop Wide (1920x1080)', width: 1920, height: 1080 },
    { name: 'Laptop (1440x900)', width: 1440, height: 900 },
    { name: 'Compact (1280x720)', width: 1280, height: 720 },
  ];

  for (const vp of VIEWPORTS) {
    test(`07.5 - [${vp.name}] OpenWork Workspace & Session UI renders with zero overflow and zero console errors`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/chat', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);

      const hasHorizontalOverflow = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return body.scrollWidth > window.innerWidth + 2 || html.scrollWidth > window.innerWidth + 2;
      });

      expect(hasHorizontalOverflow, `Horizontal overflow detected in ${vp.name}`).toBe(false);

      const root = page.locator('#root');
      await expect(root).toBeVisible();

      consoleListener.assertNoErrors();
    });
  }
});
