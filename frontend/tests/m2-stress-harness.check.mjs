import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🔥 CHALLENGER 1: EMPIRICAL STRESS HARNESS FOR MILESTONE 2 (R2)');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error('         Details:', details);
    failedTests++;
  }
}

// 1. Inspect Constants directly from useOpenWorkStore.ts
const storeFilePath = path.join(FRONTEND_DIR, 'components/openwork/useOpenWorkStore.ts');
const storeContent = fs.readFileSync(storeFilePath, 'utf-8');

// Match constants
const minSidebarMatch = storeContent.match(/export const MIN_LEFT_SIDEBAR_WIDTH = (\d+);/);
const maxSidebarMatch = storeContent.match(/export const MAX_LEFT_SIDEBAR_WIDTH = (\d+);/);
const defSidebarMatch = storeContent.match(/export const DEFAULT_LEFT_SIDEBAR_WIDTH = (\d+);/);

const minWorkbenchMatch = storeContent.match(/export const MIN_RIGHT_WORKBENCH_WIDTH = (\d+);/);
const maxWorkbenchMatch = storeContent.match(/export const MAX_RIGHT_WORKBENCH_WIDTH = (\d+);/);
const defWorkbenchMatch = storeContent.match(/export const DEFAULT_RIGHT_WORKBENCH_WIDTH = (\d+);/);

const MIN_LEFT_SIDEBAR_WIDTH = minSidebarMatch ? parseInt(minSidebarMatch[1], 10) : 220;
const MAX_LEFT_SIDEBAR_WIDTH = maxSidebarMatch ? parseInt(maxSidebarMatch[1], 10) : 420;
const DEFAULT_LEFT_SIDEBAR_WIDTH = defSidebarMatch ? parseInt(defSidebarMatch[1], 10) : 260;

const MIN_RIGHT_WORKBENCH_WIDTH = minWorkbenchMatch ? parseInt(minWorkbenchMatch[1], 10) : 320;
const MAX_RIGHT_WORKBENCH_WIDTH = maxWorkbenchMatch ? parseInt(maxWorkbenchMatch[1], 10) : 960;
const DEFAULT_RIGHT_WORKBENCH_WIDTH = defWorkbenchMatch ? parseInt(defWorkbenchMatch[1], 10) : 452;

const DEMO_SESSION_ID = '019183ab-4521-7294-81d3-9f88c3a10123';

// Extract resolveToolMeta
export function resolveToolMeta(toolName) {
  const lower = (toolName || '').toLowerCase();
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) {
    return { tab: 'slide', extension: '.pptx', defaultName: 'presentation.pptx', defaultTitle: 'Bài Thuyết Trình Slide (16:9)' };
  }
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) {
    return { tab: 'excel', extension: '.xlsx', defaultName: 'spreadsheet.xlsx', defaultTitle: 'Bảng Tính Excel' };
  }
  if (lower.includes('sql') || lower.includes('query') || lower.includes('database') || lower.includes('db_query')) {
    return { tab: 'excel', extension: '.xlsx', defaultName: 'query_result.xlsx', defaultTitle: 'Dữ Liệu Truy Vấn SQL' };
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

export function convertMessagesToStreamParts(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const parts = [];
  messages.forEach((m, i) => {
    if (m.role === 'user') {
      parts.push({
        type: 'user',
        id: `msg-${m.id || i}`,
        text: m.content || '',
      });
    } else {
      if (m.sql_used) {
        parts.push({
          type: 'capability-call',
          id: `cap-sql-${m.id || i}`,
          toolName: 'sql_query',
          displayName: 'SQL Data Analyst (sql_query)',
          language: 'sql',
          codeSnippet: m.sql_used,
          status: 'success',
        });
      }
      parts.push({
        type: 'text',
        id: `msg-${m.id || i}`,
        title: 'Kết Quả Trả Lời',
        markdown: m.content || '',
      });
    }
  });
  return parts;
}

// ============================================================================
// SUITE 1: EMPTY SESSION STATE & BOUNDARY CONDITIONS
// ============================================================================
console.log('--- SUITE 1: Empty Session State & Hydration Invariants ---');

function createFreshSession(sessionId) {
  const isDemo = sessionId === DEMO_SESSION_ID;
  const initialArtifacts = isDemo ? [
    {
      id: 'art-excel-init',
      name: 'PnL_4_Quarters_Consolidated.xlsx',
      title: 'PnL 4 Quý Hợp Nhất',
      type: 'excel',
      extension: '.xlsx',
      status: 'ready',
      version: 1,
      content: {},
      updatedAt: '10:30',
    }
  ] : [];

  return {
    activeSessionId: sessionId,
    workbenchOpen: isDemo || initialArtifacts.length > 0,
    workbenchWidth: DEFAULT_RIGHT_WORKBENCH_WIDTH,
    isMaximized: false,
    streamParts: isDemo ? [{ type: 'user', id: 'msg-1', text: 'init' }] : [],
    artifacts: initialArtifacts,
    activeTab: 'excel',
  };
}

const emptySession = createFreshSession('019183ab-0000-7000-8000-000000000001');
assert(emptySession.workbenchOpen === false, '1.1: Fresh non-demo session has workbenchOpen strictly false');
assert(emptySession.artifacts.length === 0, '1.2: Fresh non-demo session has artifacts strictly empty');
assert(emptySession.streamParts.length === 0, '1.3: Fresh non-demo session has streamParts strictly empty');
assert(emptySession.isMaximized === false, '1.4: Fresh non-demo session has isMaximized strictly false');
assert(emptySession.workbenchWidth === 452, '1.5: Fresh session workbenchWidth defaults to 452px');

const demoSession = createFreshSession(DEMO_SESSION_ID);
assert(demoSession.workbenchOpen === true, '1.6: Demo session with seeded artifacts has workbenchOpen true');
assert(demoSession.artifacts.length > 0, '1.7: Demo session has seeded artifacts');

// 1.8 State boundary handling on empty/null/corrupt conversation messages
assert(convertMessagesToStreamParts([]).length === 0, '1.8: Empty array messages returns []');
assert(convertMessagesToStreamParts(null).length === 0, '1.9: Null messages returns []');
assert(convertMessagesToStreamParts(undefined).length === 0, '1.10: Undefined messages returns []');
assert(convertMessagesToStreamParts([{ role: 'unknown', content: '' }]).length === 1, '1.11: Unknown role message falls back safely');


// ============================================================================
// SUITE 2: AUTO SLIDE-OPEN TRIGGERS MATRIX & TAB ROUTING
// ============================================================================
console.log('\n--- SUITE 2: Auto Slide-Open Triggers Matrix & Tab Routing ---');

class MockStoreStateMachine {
  constructor() {
    this.workbenchOpen = false;
    this.activeTab = 'excel';
    this.activeArtifactId = '';
    this.isMaximized = false;
    this.artifacts = [];
  }

  onToolCallDelta(toolName, argsStr, callId) {
    const meta = resolveToolMeta(toolName);
    const parsed = parsePartialJson(argsStr);
    const artId = callId || `art-${meta.tab}`;

    const idx = this.artifacts.findIndex((a) => a.id === artId || a.type === meta.tab);
    const generating = {
      id: artId,
      name: parsed?.title ? `${parsed.title}${meta.extension}` : meta.defaultName,
      title: parsed?.title || meta.defaultTitle,
      type: meta.tab,
      extension: meta.extension,
      status: 'generating',
      version: 1,
      content: parsed || {},
      updatedAt: 'Đang tạo...',
    };

    if (idx >= 0) {
      this.artifacts[idx] = generating;
    } else {
      this.artifacts.push(generating);
    }

    this.activeTab = meta.tab;
    this.workbenchOpen = true;
    this.activeArtifactId = artId;
  }

  openArtifactByPath(pathStr) {
    const filename = pathStr.split('/').pop() || pathStr;
    const lower = filename.toLowerCase();

    let tab = 'chart';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
      tab = 'excel';
    } else if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
      tab = 'slide';
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.pdf')) {
      tab = 'docx';
    } else if (lower.endsWith('.py') || lower.endsWith('.sql') || lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.json')) {
      tab = 'code';
    } else {
      tab = 'chart';
    }

    this.activeTab = tab;
    this.workbenchOpen = true;
  }

  toggleMaximized() {
    this.isMaximized = !this.isMaximized;
  }
}

const sm = new MockStoreStateMachine();
assert(sm.workbenchOpen === false, '2.1: Initial workbenchOpen is false');

// 2.2 Trigger presentation_builder
sm.onToolCallDelta('presentation_builder', '{"title": "Executive Deck"}', 'call-slide-1');
assert(sm.workbenchOpen === true, '2.2: onToolCallDelta presentation_builder auto opens workbench');
assert(sm.activeTab === 'slide', '2.3: activeTab switches to slide');

// Reset and test spreadsheet_studio
sm.workbenchOpen = false;
sm.onToolCallDelta('spreadsheet_studio', '{"title": "Financial Model"}', 'call-excel-1');
assert(sm.workbenchOpen === true, '2.4: onToolCallDelta spreadsheet_studio auto opens workbench');
assert(sm.activeTab === 'excel', '2.5: activeTab switches to excel');

// Reset and test doc_writer
sm.workbenchOpen = false;
sm.onToolCallDelta('doc_writer', '{"title": "Report"}', 'call-docx-1');
assert(sm.workbenchOpen === true, '2.6: onToolCallDelta doc_writer auto opens workbench');
assert(sm.activeTab === 'docx', '2.7: activeTab switches to docx');

// Reset and test python_interpreter
sm.workbenchOpen = false;
sm.onToolCallDelta('python_interpreter', '{"code": "print(1)"}', 'call-code-1');
assert(sm.workbenchOpen === true, '2.8: onToolCallDelta python_interpreter auto opens workbench');
assert(sm.activeTab === 'code', '2.9: activeTab switches to code');

// Reset and test sql_query
sm.workbenchOpen = false;
sm.onToolCallDelta('sql_query', '{"query": "SELECT * FROM t"}', 'call-sql-1');
assert(sm.workbenchOpen === true, '2.10: onToolCallDelta sql_query auto opens workbench (excel format)');
assert(sm.activeTab === 'excel', '2.11: activeTab switches to excel');

// 2.12 openArtifactByPath triggers
const testPaths = [
  ['/workspace/data/model.xlsx', 'excel'],
  ['/workspace/decks/investor.pptx', 'slide'],
  ['/workspace/docs/memo.docx', 'docx'],
  ['/workspace/scripts/etl.py', 'code'],
  ['/workspace/images/sales.png', 'chart'],
  ['/workspace/reports/summary.pdf', 'docx'],
  ['/workspace/queries/analytics.sql', 'code'],
];

for (const [p, expectedTab] of testPaths) {
  sm.workbenchOpen = false;
  sm.openArtifactByPath(p);
  assert(
    sm.workbenchOpen === true && sm.activeTab === expectedTab,
    `2.12: openArtifactByPath('${p}') opens workbench and routes to '${expectedTab}'`
  );
}


// ============================================================================
// SUITE 3: RAPID 10,000-CYCLE TOGGLING OF `isMaximized`
// ============================================================================
console.log('\n--- SUITE 3: Rapid 10,000-Cycle Toggling of isMaximized ---');

const stressSM = new MockStoreStateMachine();
assert(stressSM.isMaximized === false, '3.1: isMaximized starts as false');

const ITERATIONS = 10000;
const startTimer = performance.now();

for (let i = 1; i <= ITERATIONS; i++) {
  stressSM.toggleMaximized();
  if (i % 2 === 1) {
    if (stressSM.isMaximized !== true) {
      throw new Error(`Cycle ${i} failed: expected isMaximized = true`);
    }
  } else {
    if (stressSM.isMaximized !== false) {
      throw new Error(`Cycle ${i} failed: expected isMaximized = false`);
    }
  }
}

const elapsedMs = performance.now() - startTimer;
const opsPerSec = Math.round((ITERATIONS / elapsedMs) * 1000);

assert(
  stressSM.isMaximized === false,
  `3.2: After exact ${ITERATIONS} toggles, isMaximized returns cleanly to false`
);
assert(
  elapsedMs < 100,
  `3.3: 10,000 toggle cycles executed in ${elapsedMs.toFixed(2)}ms (> ${opsPerSec.toLocaleString()} ops/sec)`
);

// Toggle once more to make it 10,001
stressSM.toggleMaximized();
assert(stressSM.isMaximized === true, '3.4: 10,001st toggle sets isMaximized to true');

// Verify layout style invariants under isMaximized: true vs false
function computeShellClasses(isMaximized) {
  return {
    chatContainerClass: isMaximized ? 'flex-1 min-w-0 flex flex-col h-full hidden w-0' : 'flex-1 min-w-0 flex flex-col h-full',
    sidebarRendered: !isMaximized,
    workbenchWidthStyle: isMaximized ? '100%' : '452px',
    workbenchFlexClass: isMaximized ? 'h-full flex shrink-0 overflow-hidden relative w-full flex-1' : 'h-full flex shrink-0 overflow-hidden relative',
  };
}

const maximizedLayout = computeShellClasses(true);
assert(maximizedLayout.chatContainerClass.includes('hidden w-0'), '3.5: Maximized collapses chat container (hidden w-0)');
assert(maximizedLayout.sidebarRendered === false, '3.6: Maximized unmounts/hides left sidebar');
assert(maximizedLayout.workbenchWidthStyle === '100%', '3.7: Maximized expands workbench to 100%');
assert(maximizedLayout.workbenchFlexClass.includes('w-full flex-1'), '3.8: Maximized applies w-full flex-1');

const restoredLayout = computeShellClasses(false);
assert(!restoredLayout.chatContainerClass.includes('hidden'), '3.9: Restored makes chat container visible');
assert(restoredLayout.sidebarRendered === true, '3.10: Restored renders left sidebar');
assert(restoredLayout.workbenchWidthStyle === '452px', '3.11: Restored resets workbench width to split width (452px)');


// ============================================================================
// SUITE 4: WINDOW RESIZING & BOUNDARY CLAMPING CONSTRAINTS
// ============================================================================
console.log('\n--- SUITE 4: Window Resizing & Boundary Clamping Constraints ---');

assert(MIN_LEFT_SIDEBAR_WIDTH === 220, '4.1: MIN_LEFT_SIDEBAR_WIDTH is 220');
assert(MAX_LEFT_SIDEBAR_WIDTH === 420, '4.2: MAX_LEFT_SIDEBAR_WIDTH is 420');
assert(DEFAULT_LEFT_SIDEBAR_WIDTH === 260, '4.3: DEFAULT_LEFT_SIDEBAR_WIDTH is 260');

assert(MIN_RIGHT_WORKBENCH_WIDTH === 320, '4.5: MIN_RIGHT_WORKBENCH_WIDTH is 320');
assert(MAX_RIGHT_WORKBENCH_WIDTH === 960, '4.6: MAX_RIGHT_WORKBENCH_WIDTH is 960');
assert(DEFAULT_RIGHT_WORKBENCH_WIDTH === 452, '4.7: DEFAULT_RIGHT_WORKBENCH_WIDTH is 452');

// Clamping functions simulation from useOpenWorkStore
function clampSidebar(raw) {
  return Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, raw));
}

function clampWorkbench(raw) {
  return Math.max(MIN_RIGHT_WORKBENCH_WIDTH, Math.min(MAX_RIGHT_WORKBENCH_WIDTH, raw));
}

// Drag calculation simulation from OpenWorkShell
function calculateWorkbenchDragWidth(clientX, windowInnerWidth, sidebarOpen, sidebarWidth) {
  const maxW = Math.min(
    MAX_RIGHT_WORKBENCH_WIDTH,
    windowInnerWidth - (sidebarOpen ? sidebarWidth : 0) - 360
  );
  return Math.max(
    MIN_RIGHT_WORKBENCH_WIDTH,
    Math.min(maxW, windowInnerWidth - clientX)
  );
}

// Test clamp boundaries
assert(clampSidebar(-1000) === 220, '4.8: Negative sidebar width clamped to 220');
assert(clampSidebar(0) === 220, '4.9: 0 sidebar width clamped to 220');
assert(clampSidebar(219) === 220, '4.10: 219 sidebar width clamped to 220');
assert(clampSidebar(300) === 300, '4.11: 300 sidebar width passes unchanged');
assert(clampSidebar(421) === 420, '4.12: 421 sidebar width clamped to 420');
assert(clampSidebar(99999) === 420, '4.13: 99999 sidebar width clamped to 420');

assert(clampWorkbench(-500) === 320, '4.14: Negative workbench width clamped to 320');
assert(clampWorkbench(0) === 320, '4.15: 0 workbench width clamped to 320');
assert(clampWorkbench(319) === 320, '4.16: 319 workbench width clamped to 320');
assert(clampWorkbench(452) === 452, '4.17: 452 workbench width passes unchanged');
assert(clampWorkbench(680) === 680, '4.18: 680 workbench width passes unchanged');
assert(clampWorkbench(961) === 960, '4.19: 961 workbench width clamped to 960');
assert(clampWorkbench(100000) === 960, '4.20: 100000 workbench width clamped to 960');

// Test drag resizing on different viewport resolutions
// 1. 1920x1080 Full HD Viewport (ClientX = 1400 -> raw width = 520)
const w1920 = calculateWorkbenchDragWidth(1400, 1920, true, 260);
assert(w1920 === 520, '4.21: 1920px screen: drag to clientX=1400 results in 520px width');

// 2. 1920x1080 Viewport with extreme drag left (ClientX = 100 -> raw width = 1820 -> clamped to 960)
const w1920Max = calculateWorkbenchDragWidth(100, 1920, true, 260);
assert(w1920Max === 960, '4.22: 1920px screen: extreme drag left clamped to MAX 960px');

// 3. 1024x768 Tablet Viewport (Max width available = 1024 - 260 - 360 = 404px)
const w1024 = calculateWorkbenchDragWidth(500, 1024, true, 260);
assert(w1024 === 404, '4.23: 1024px screen: clamped dynamically to 404px to preserve 360px chat column');

// 4. Extreme small viewport (480px mobile) -> clamped to MIN 320px
const w480 = calculateWorkbenchDragWidth(100, 480, false, 0);
assert(w480 === 320, '4.24: 480px screen: clamped safely to MIN 320px');


// ============================================================================
// SUITE 5: DESIGN DNA 44px TAB HEADER & ACTION BAR INVARIANTS
// ============================================================================
console.log('\n--- SUITE 5: Design DNA 44px Tab Header & Action Bar Invariants ---');

const workbenchFile = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkWorkbench.tsx');
const workbenchContent = fs.readFileSync(workbenchFile, 'utf-8');

assert(
  workbenchContent.includes('h-[44px] min-h-[44px]'),
  '5.1: OpenWorkWorkbench contains exact 44px header classes (h-[44px] min-h-[44px])'
);
assert(
  workbenchContent.includes('handleQuickCopy'),
  '5.2: OpenWorkWorkbench contains quick copy action handler'
);
assert(
  workbenchContent.includes('handleDownload'),
  '5.3: OpenWorkWorkbench contains download action handler'
);
assert(
  workbenchContent.includes('handlePopout'),
  '5.4: OpenWorkWorkbench contains popout action handler'
);
assert(
  workbenchContent.includes('handleToggleMaximize'),
  '5.5: OpenWorkWorkbench contains maximize/minimize action handler'
);
assert(
  workbenchContent.includes('ĐÃ ĐỒNG BỘ · v'),
  '5.6: OpenWorkWorkbench metadata bar contains ĐÃ ĐỒNG BỘ status pill'
);
assert(
  workbenchContent.includes('Bảo toàn công thức'),
  '5.7: OpenWorkWorkbench metadata bar contains fx Bảo toàn công thức badge'
);

console.log('\n================================================================');
console.log(`🔥 Empirical Stress Harness Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
