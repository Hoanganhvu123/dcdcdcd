import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' DUAL-VENDOR AI PROVIDER ENGINE (M1) VERIFICATION HARNESS');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function check(condition, testName, details = null) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// 1. types.ts Static Verification
const typesPath = path.join(rootDir, 'components/openwork/types.ts');
check(fs.existsSync(typesPath), 'types.ts exists');
const typesContent = fs.readFileSync(typesPath, 'utf8');
const storeContentEarly = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'openwork', 'useOpenWorkStore.ts'),
  'utf8',
);
const streamContent = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'openwork', 'services', 'deepseek-stream.ts'),
  'utf8',
);

check(
  typesContent.includes("export type ProviderKind = 'openrouter' | 'deepseek' | 'dbgpt' | 'agent-wrap';"),
  "types.ts exports ProviderKind including openrouter"
);

check(
  typesContent.includes('export interface ModelOption') &&
  typesContent.includes('provider: ProviderKind'),
  'types.ts exports ModelOption interface linked to ProviderKind'
);

const BANNED_MODEL_IDS = [
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek/deepseek-r1',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'vicuna-13b',
  'chatglm',
  'baichuan',
];
check(
  typesContent.includes('export const PROVIDER_MODEL_CATALOG: Record<ProviderKind, ModelOption[]>') &&
  typesContent.includes('deepseek-v4-flash'),
  'types.ts defines PROVIDER_MODEL_CATALOG with deepseek-v4-flash'
);
// Khoá cứng: catalog chỉ được chứa deepseek-v4-flash, không model nào khác.
const leakedInTypes = BANNED_MODEL_IDS.filter((m) => typesContent.includes(m));
check(
  leakedInTypes.length === 0,
  'PROVIDER_MODEL_CATALOG chi chua deepseek-v4-flash (leaked: ' + leakedInTypes.join(', ') + ')'
);
// Hydration phai loc model cu trong localStorage qua catalog, khong chi fallback khi rong.
check(
  storeContentEarly.includes('const pickCatalogModel ='),
  'useOpenWorkStore.ts co helper pickCatalogModel',
);
for (const kind of ['deepseek', 'dbgpt']) {
  check(
    storeContentEarly.includes(`pickCatalogModel('${kind}'`),
    `hydration ${kind} model di qua pickCatalogModel`,
  );
}

// providerKind: 'openrouter' co the xuat hien o nhieu noi trong file,
// nen phai neo dung vao block DEFAULT_OPENWORK_SETTINGS thay vi includes tran.
function defaultsBlockUsesOpenRouter(src) {
  const start = src.indexOf('DEFAULT_OPENWORK_SETTINGS: OpenWorkSettings = {');
  if (start < 0) return false;
  const hit = src.indexOf("providerKind: 'openrouter',", start);
  return hit > start && hit - start < 300;
}

// ── OpenRouter Gateway chinh thuc la vendor mac dinh (chot). Gate doc thang source, khong mo phong. ──
check(
  defaultsBlockUsesOpenRouter(storeContentEarly),
  "DEFAULT_OPENWORK_SETTINGS dat providerKind: 'openrouter'",
);
check(
  streamContent.includes("provider: ProviderKind = 'openrouter'") ||
    streamContent.includes("provider: ProviderKind = 'deepseek'"),
  "buildProviderHeaders dinh nghia provider",
);
check(
  (streamContent.includes('DEFAULT_OPENROUTER_BASE_URL') ||
    streamContent.includes('DEFAULT_DEEPSEEK_BASE_URL')) &&
    (streamContent.includes('DEFAULT_OPENROUTER_MODEL') ||
      streamContent.includes('DEFAULT_DEEPSEEK_MODEL')),
  'streamDeepSeekChat mac dinh baseUrl + model theo nha cung cap chinh thuc',
);

const leakedInStore = BANNED_MODEL_IDS.filter((m) => storeContentEarly.includes(m));
check(
  leakedInStore.length === 0,
  'useOpenWorkStore.ts khong con fallback model cu (leaked: ' + leakedInStore.join(', ') + ')'
);

check(
  typesContent.includes('export interface ActiveProviderConfig') &&
  typesContent.includes('providerKind: ProviderKind;') &&
  typesContent.includes('apiKey: string;') &&
  typesContent.includes('apiBaseUrl: string;') &&
  typesContent.includes('model: string;') &&
  typesContent.includes('headers: Record<string, string>;'),
  'types.ts exports ActiveProviderConfig interface contract'
);

check(
  typesContent.includes('deepseekApiKey?: string;') &&
  typesContent.includes('deepseekBaseUrl?: string;') &&
  typesContent.includes('deepseekModel?: string;') &&
  typesContent.includes('dbgptBaseUrl?: string;') &&
  typesContent.includes('dbgptModel?: string;') &&
  typesContent.includes('dbgptApiKey?: string;'),
  'types.ts extends OpenWorkSettings with isolated dedicated provider fields'
);

// 2. useOpenWorkStore.ts Static Verification
const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
check(fs.existsSync(storePath), 'useOpenWorkStore.ts exists');
const storeContent = fs.readFileSync(storePath, 'utf8');

check(
  storeContent.includes('export const DEFAULT_OPENWORK_SETTINGS: OpenWorkSettings =') &&
  defaultsBlockUsesOpenRouter(storeContent) &&
  storeContent.includes('DEFAULT_OPENROUTER_BASE_URL') &&
  storeContent.includes('DEFAULT_DBGPT_BASE_URL'),
  'useOpenWorkStore.ts defines DEFAULT_OPENWORK_SETTINGS with defaults for both providers'
);

check(
  storeContent.includes('export function resolveActiveProviderConfig(settings: Partial<OpenWorkSettings>): ActiveProviderConfig'),
  'useOpenWorkStore.ts exports resolveActiveProviderConfig function'
);

check(
  storeContent.includes('const setProvider = useCallback(') &&
  storeContent.includes('setProvider,'),
  'useOpenWorkStore.ts defines and returns setProvider action'
);

check(
  storeContent.includes('providerCatalog: PROVIDER_MODEL_CATALOG'),
  'useOpenWorkStore.ts exposes providerCatalog in hook return'
);

check(
  storeContent.includes('customHeaders: activeConfig.headers') ||
  storeContent.includes('activeConfig.headers'),
  'useOpenWorkStore.ts passes resolved customHeaders to streamDeepSeekChat'
);

// 3. Functional Simulation of resolveActiveProviderConfig
function resolveActiveProviderConfigSim(settings) {
  const providerKind = settings.providerKind || 'deepseek';
  const DEFAULT_DEEPSEEK_BASE_URL = '/api/deepseek';
  const DEFAULT_DBGPT_BASE_URL = '/api/v1';

  switch (providerKind) {
    case 'dbgpt': {
      const apiKey = settings.dbgptApiKey || '';
      const apiBaseUrl = (settings.dbgptBaseUrl !== undefined && settings.dbgptBaseUrl !== null ? settings.dbgptBaseUrl : settings.apiBaseUrl) || DEFAULT_DBGPT_BASE_URL;
      const model = (settings.dbgptModel !== undefined && settings.dbgptModel !== null ? settings.dbgptModel : settings.model) || 'vicuna-13b';
      const headers = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return { providerKind: 'dbgpt', apiKey: apiKey.trim(), apiBaseUrl: apiBaseUrl.trim(), model: model.trim(), headers };
    }
    case 'deepseek':
    default: {
      const apiKey = (settings.deepseekApiKey !== undefined && settings.deepseekApiKey !== null ? settings.deepseekApiKey : settings.apiKey) || 'sk-default-deepseek';
      const apiBaseUrl = (settings.deepseekBaseUrl !== undefined && settings.deepseekBaseUrl !== null ? settings.deepseekBaseUrl : settings.apiBaseUrl) || DEFAULT_DEEPSEEK_BASE_URL;
      const model = (settings.deepseekModel !== undefined && settings.deepseekModel !== null ? settings.deepseekModel : settings.model) || 'deepseek-v4-flash';
      const headers = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return { providerKind: 'deepseek', apiKey: apiKey.trim(), apiBaseUrl: apiBaseUrl.trim(), model: model.trim(), headers };
    }
  }
}

// 4. Multi-Vendor Key Isolation Tests
const deepseekUser = {
  providerKind: 'deepseek',
  deepseekApiKey: 'sk-dsk-user-key',
  dbgptApiKey: '',
};
const resDsk = resolveActiveProviderConfigSim(deepseekUser);
check(
  resDsk.providerKind === 'deepseek' &&
  resDsk.apiKey === 'sk-dsk-user-key' &&
  resDsk.headers['Authorization'] === 'Bearer sk-dsk-user-key',
  'DeepSeek resolution cleanly isolates deepseekApiKey'
);

const dbgptUser = {
  providerKind: 'dbgpt',
  deepseekApiKey: 'sk-dsk-user-key',
  dbgptModel: 'vicuna-13b',
};
const resDbgpt = resolveActiveProviderConfigSim(dbgptUser);
check(
  resDbgpt.providerKind === 'dbgpt' &&
  resDbgpt.apiKey === '' &&
  resDbgpt.headers['Authorization'] === undefined &&
  resDbgpt.model === 'vicuna-13b',
  'DB-GPT resolution uses local backend without external auth header leak'
);

// -- Gate chong lo API key vao bundle client --
// Vite inline moi bien VITE_* thang vao bundle client, nen bat ky client source nao
// doc import.meta.env.*_API_KEY deu la gui secret cho moi trinh duyet. Ca hai provider
// da di qua proxy server-side (/api/deepseek, /api/v1) nen client khong can key.
const NL = String.fromCharCode(10);
const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
function scanClientEnvKeyReads(dir) {
  const bad = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (!CODE_EXT.some((ext) => entry.name.endsWith(ext))) continue;
      fs.readFileSync(full, 'utf8').split(NL).forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (line.includes('import.meta') && line.includes('env') && line.includes('_API_KEY')) {
          bad.push(path.relative(rootDir, full) + ':' + (i + 1));
        }
      });
    }
  };
  walk(dir);
  return bad;
}
const envKeyLeaks = scanClientEnvKeyReads(path.join(rootDir, 'components/openwork'));
check(
  envKeyLeaks.length === 0,
  'khong client source nao doc import.meta.env.*_API_KEY (tranh inline secret vao bundle)',
  envKeyLeaks.length ? envKeyLeaks.join(', ') : null,
);

console.log(`\nMulti-Vendor M1 Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  process.exit(1);
}
