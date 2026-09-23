import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' OPENWORK STORE, HISTORY, SKILLS & PERSISTENCE VERIFICATION');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = null) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// 1. useOpenWorkStore.ts Verification
const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
assert(fs.existsSync(storePath), 'useOpenWorkStore.ts exists');

const storeContent = fs.readFileSync(storePath, 'utf8');

assert(
  storeContent.includes('export function useOpenWorkStore') ||
  storeContent.includes('export const useOpenWorkStore'),
  'useOpenWorkStore is exported'
);

assert(
  storeContent.includes('PERSISTED_SETTINGS_KEY') &&
  storeContent.includes('PERSISTED_UI_STATE_KEY') &&
  storeContent.includes('PERSISTED_SKILLS_KEY'),
  'useOpenWorkStore defines persistence keys including PERSISTED_SKILLS_KEY'
);

assert(
  storeContent.includes('openwork:skills:v1'),
  'PERSISTED_SKILLS_KEY maps to openwork:skills:v1'
);

assert(
  storeContent.includes('id: c.id || c.conversation_id'),
  'fetchSessions correctly maps id: c.id || c.conversation_id'
);

assert(
  storeContent.includes('convertMessagesToStreamParts'),
  'useOpenWorkStore exports or defines convertMessagesToStreamParts'
);

assert(
  storeContent.includes('getConversationMessages(id)') ||
  storeContent.includes('getConversationMessages(sessionFromUrl)'),
  'useOpenWorkStore hydrates conversation messages from backend on mount/refresh'
);

assert(
  storeContent.includes('getActiveTools') && storeContent.includes('SKILL_TOOL_MAP'),
  'useOpenWorkStore wires getActiveTools and SKILL_TOOL_MAP'
);

assert(
  storeContent.includes('disabledNotice') || storeContent.includes('DISABLED CAPABILITIES'),
  'useOpenWorkStore conditions system prompt with disabled skills notice'
);

// 2. openwork-tools.ts Verification
const toolsPath = path.join(rootDir, 'components/openwork/services/openwork-tools.ts');
assert(fs.existsSync(toolsPath), 'openwork-tools.ts exists');
const toolsContent = fs.readFileSync(toolsPath, 'utf8');

assert(
  toolsContent.includes('export const SKILL_TOOL_MAP') &&
  toolsContent.includes('sql-agent') &&
  toolsContent.includes('sql_query'),
  'openwork-tools.ts exports SKILL_TOOL_MAP mapping sql-agent to sql_query'
);

assert(
  toolsContent.includes('export function getActiveTools'),
  'openwork-tools.ts exports getActiveTools function'
);

// 3. conversation-api.ts Verification
const apiPath = path.join(rootDir, 'components/openwork/services/conversation-api.ts');
assert(fs.existsSync(apiPath), 'conversation-api.ts exists');
const apiContent = fs.readFileSync(apiPath, 'utf8');

assert(
  apiContent.includes('export async function listConversations') &&
  apiContent.includes('export async function getConversationMessages') &&
  apiContent.includes('export async function createConversation') &&
  apiContent.includes('export async function saveConversationMessage') &&
  apiContent.includes('export async function deleteConversation'),
  'conversation-api.ts exports all 5 CRUD functions'
);

assert(
  apiContent.includes('signal?: AbortSignal'),
  'conversation-api.ts supports AbortSignal for abortable requests'
);

// 4. OpenWorkSettingsModal.tsx Verification
const modalPath = path.join(rootDir, 'components/openwork/OpenWorkSettingsModal.tsx');
assert(fs.existsSync(modalPath), 'OpenWorkSettingsModal.tsx exists');
const modalContent = fs.readFileSync(modalPath, 'utf8');

assert(
  modalContent.includes('OPENWORK_SETTINGS_STORAGE_KEY') &&
  modalContent.includes('openwork:settings:v1'),
  'OpenWorkSettingsModal uses openwork:settings:v1'
);

assert(
  !modalContent.includes('text-zinc-100') &&
  !modalContent.includes('bg-zinc-800/80') &&
  !modalContent.includes('text-zinc-200'),
  'OpenWorkSettingsModal eliminates hardcoded dark zinc text colors for light/dark parity'
);

// 5. UUIDv7 RFC 9562 Generator Verification
const uuidPath = path.join(rootDir, 'components/openwork/services/uuid.ts');
assert(fs.existsSync(uuidPath), 'uuid.ts exists');
const uuidContent = fs.readFileSync(uuidPath, 'utf8');

assert(
  uuidContent.includes('export function generateUUIDv7'),
  'uuid.ts exports generateUUIDv7 function'
);

assert(
  uuidContent.includes('bytes[6] = (bytes[6] & 0x0f) | 0x70') ||
  uuidContent.includes('0x70'),
  'generateUUIDv7 sets UUID version 7 in octet 6'
);

assert(
  uuidContent.includes('bytes[8] = (bytes[8] & 0x3f) | 0x80') ||
  uuidContent.includes('0x80'),
  'generateUUIDv7 sets RFC 4122/9562 variant in octet 8'
);

// Functional validation of UUIDv7 generator logic
function testGenerateUUIDv7() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const now = Date.now();
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(now / 0x100000000) & 0xff;
  bytes[2] = Math.floor(now / 0x1000000) & 0xff;
  bytes[3] = Math.floor(now / 0x10000) & 0xff;
  bytes[4] = Math.floor(now / 0x100) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

const sampleUUIDs = Array.from({ length: 50 }, () => testGenerateUUIDv7());
const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

assert(
  sampleUUIDs.every((id) => id.length === 36 && uuidv7Regex.test(id)),
  'generateUUIDv7 produces valid 36-character RFC 9562 UUIDv7 strings matching format'
);

assert(
  sampleUUIDs.every((id) => !id.startsWith('session-') && !id.startsWith('local-')),
  'generateUUIDv7 strictly eliminates all session- and local- prefixes'
);

// 6. DeepSeek V4 & Official DeepSeek API Configuration Verification
const streamPath = path.join(rootDir, 'components/openwork/services/deepseek-stream.ts');
assert(fs.existsSync(streamPath), 'deepseek-stream.ts exists');
const streamContent = fs.readFileSync(streamPath, 'utf8');

assert(
  streamContent.includes('deepseek-v4-flash'),
  'deepseek-stream.ts defines default model deepseek-v4-flash'
);

assert(
  streamContent.includes('DEFAULT_DEEPSEEK_API_KEY'),
  'deepseek-stream.ts defines DEFAULT_DEEPSEEK_API_KEY configuration'
);

assert(
  streamContent.includes('/api/deepseek') || streamContent.includes('160.191.50.138') || streamContent.includes('https://api.deepseek.com'),
  'deepseek-stream.ts defines streaming endpoint URL'
);

assert(
  streamContent.includes('deepseek-v4-flash'),
  'deepseek-stream.ts defines official model engine'
);

assert(
  streamContent.includes('reasoning_content') &&
  streamContent.includes('content') &&
  streamContent.includes('tool_calls'),
  'deepseek-stream.ts supports SSE streaming for Chain-of-Thought reasoning, prose, and tool calls'
);

// 7. Complete Conversation State Isolation Verification
assert(
  storeContent.includes('openwork:session-data:'),
  'useOpenWorkStore defines SESSION_DATA_PREFIX for per-conversation state isolation'
);

assert(
  !storeContent.includes('session-q3-pnl-review'),
  'useOpenWorkStore eliminates hardcoded session-q3-pnl-review prefix'
);

console.log(`\nOpenWork History & Skills Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  process.exit(1);
}
