import {
  SKILL_TOOL_MAP,
  getActiveTools,
  OPENWORK_TOOL_DEFINITIONS,
} from '../components/openwork/services/openwork-tools';
import { convertMessagesToStreamParts } from '../components/openwork/useOpenWorkStore';
import type { OpenWorkSkillItem } from '../components/openwork/types';

console.log('================================================================');
console.log(' M2: CONVERSATION HYDRATION & SKILLS WIRING TS CHECK');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// 1. Test getActiveTools with all skills enabled
const allSkillsEnabled: OpenWorkSkillItem[] = [
  { id: 'sql-agent', name: 'SQL Data Analyst', description: '', enabled: true, category: 'Database' },
  { id: 'chart-vis', name: 'Interactive Charts', description: '', enabled: true, category: 'Visualization' },
  { id: 'doc-writer', name: 'Executive Document Writer', description: '', enabled: true, category: 'Office' },
  { id: 'spreadsheet-studio', name: 'Spreadsheet Studio', description: '', enabled: true, category: 'Office' },
  { id: 'presentation-builder', name: 'Presentation Studio', description: '', enabled: true, category: 'Office' },
  { id: 'autonomous-mcp', name: 'MCP Autonomous Tool Bridge', description: '', enabled: true, category: 'Autonomous' },
];

const allTools = getActiveTools(allSkillsEnabled);
assert(allTools.length === 5, 'getActiveTools returns all 5 tool definitions when all skills enabled', { length: allTools.length });

const toolNames = allTools.map((t) => t.function.name);
assert(toolNames.includes('sql_query'), 'allTools contains sql_query');
assert(toolNames.includes('spreadsheet_studio'), 'allTools contains spreadsheet_studio');
assert(toolNames.includes('presentation_builder'), 'allTools contains presentation_builder');
assert(toolNames.includes('doc_writer'), 'allTools contains doc_writer');
assert(toolNames.includes('python_interpreter'), 'allTools contains python_interpreter');

// 2. Test getActiveTools when Database (sql-agent) is DISABLED
const sqlDisabledSkills: OpenWorkSkillItem[] = allSkillsEnabled.map((s) =>
  s.id === 'sql-agent' ? { ...s, enabled: false } : s
);
const sqlDisabledTools = getActiveTools(sqlDisabledSkills);
const sqlDisabledToolNames = sqlDisabledTools.map((t) => t.function.name);

assert(!sqlDisabledToolNames.includes('sql_query'), 'sql_query is excluded when sql-agent skill is disabled');
assert(sqlDisabledToolNames.includes('presentation_builder'), 'presentation_builder remains active when only sql-agent is disabled');
assert(sqlDisabledToolNames.includes('spreadsheet_studio'), 'spreadsheet_studio remains active');
assert(sqlDisabledTools.length === 4, 'getActiveTools returns exactly 4 tools when sql-agent disabled', { length: sqlDisabledTools.length });

// 3. Test getActiveTools when ALL skills are DISABLED
const allDisabledSkills: OpenWorkSkillItem[] = allSkillsEnabled.map((s) => ({ ...s, enabled: false }));
const allDisabledTools = getActiveTools(allDisabledSkills);
assert(allDisabledTools.length === 0, 'getActiveTools returns empty array when all skills disabled', { length: allDisabledTools.length });

// 4. Test getActiveTools when only presentation-builder is enabled
const onlySlideSkill: OpenWorkSkillItem[] = allSkillsEnabled.map((s) => ({
  ...s,
  enabled: s.id === 'presentation-builder',
}));
const onlySlideTools = getActiveTools(onlySlideSkill);
assert(onlySlideTools.length === 1, 'Only 1 tool returned when only presentation-builder is enabled');
assert(onlySlideTools[0]?.function.name === 'presentation_builder', 'Returned tool is presentation_builder');

// 5. Test convertMessagesToStreamParts
const mockBackendMessages = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Phân tích doanh thu quý 3 và viết báo cáo',
    created_at: '2026-08-27T10:00:00Z',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Dưới đây là kết quả phân tích doanh thu...',
    sql_used: 'SELECT quarter, revenue FROM q3_records;',
    created_at: '2026-08-27T10:00:05Z',
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Tạo thêm biểu đồ',
    created_at: '2026-08-27T10:01:00Z',
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'Đã hoàn thành biểu đồ.',
    created_at: '2026-08-27T10:01:05Z',
  },
];

const convertedParts = convertMessagesToStreamParts(mockBackendMessages);
assert(convertedParts.length === 5, 'convertMessagesToStreamParts produces 5 parts (2 user, 1 sql cap call, 2 text parts)', { length: convertedParts.length });

const userParts = convertedParts.filter((p) => p.type === 'user');
assert(userParts.length === 2, '2 user stream parts generated');
assert(userParts[0]?.text === 'Phân tích doanh thu quý 3 và viết báo cáo', 'First user message content matches');

const capParts = convertedParts.filter((p) => p.type === 'capability-call');
assert(capParts.length === 1, '1 SQL capability call part generated from sql_used');
assert((capParts[0] as any)?.codeSnippet === 'SELECT quarter, revenue FROM q3_records;', 'SQL codeSnippet matches');

const textParts = convertedParts.filter((p) => p.type === 'text');
assert(textParts.length === 2, '2 assistant text stream parts generated');
assert((textParts[0] as any)?.markdown.includes('Dưới đây là kết quả'), 'First assistant text markdown matches');

// Empty and edge cases for convertMessagesToStreamParts
assert(convertMessagesToStreamParts([]).length === 0, 'convertMessagesToStreamParts handles empty array');
assert(convertMessagesToStreamParts(null as any).length === 0, 'convertMessagesToStreamParts handles null');
assert(convertMessagesToStreamParts(undefined as any).length === 0, 'convertMessagesToStreamParts handles undefined');

console.log(`\n================================================================`);
console.log(` M2 TypeScript Verification Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
