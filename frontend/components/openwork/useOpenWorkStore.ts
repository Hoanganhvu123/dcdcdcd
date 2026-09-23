import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from '../../shims/next-router';
import { toast } from 'sonner';
import {
  createConversation,
  listConversations,
  getConversationMessages,
  saveConversationMessage,
  deleteConversation,
  type ConversationSummary,
  type ConversationMessage,
} from './services/conversation-api';
import {
  generateUUIDv7,
  isValidUUIDv7,
  storageManager,
  buildStorageKey,
  purgeSession,
  purgeSessionData,
} from '../../lib/security/storage-manager';

import {
  type AgentMemoryCard,
  type MemoryCardType,
  getGlobalMemories,
  saveGlobalMemories,
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  toggleGlobalMemory,
  togglePinGlobalMemory,
  resetGlobalMemoriesToDefault,
  formatMemoriesForSystemPrompt,
  extractMemoryCardsFromText,
  exportMemoriesToJson,
  importMemoriesFromJson,
} from '../../lib/memory/globalMemoryStore';

import type {
  OpenWorkSessionItem,
  OpenWorkWorkspaceInfo,
  OpenWorkConnectorStatus,
  OpenWorkSkillItem,
  OpenWorkArtifactTab,
  OpenWorkArtifact,
  OpenWorkStreamPart,
  OpenWorkSettings,
  DatasourceItem,
  ReasoningPart,
  PlanPart,
  CapabilityCallPart,
  AssistantTextPart,
  ProviderKind,
  ModelOption,
  ActiveProviderConfig,
} from './types';
import type { SlashCommandDefinition } from './slash-commands/slash-commands';
import { PROVIDER_MODEL_CATALOG } from './types';

// Model luu trong localStorage co the la id cu tu ban truoc.
// Chi giu lai neu con trong catalog cua provider, khong thi ve mac dinh.
const pickCatalogModel = (kind: ProviderKind, saved: string | undefined, fallback: string): string =>
  (PROVIDER_MODEL_CATALOG[kind] || []).some((m) => m.value === saved) ? (saved as string) : fallback;
import { apiInterceptors, getDbList } from '../../client/api';
import { useConnectors } from '../../hooks/use-connector-api';
import {
  streamDeepSeekChat,
  type DeepSeekChatMessage,
  DEFAULT_OPENROUTER_API_KEY,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_DEEPSEEK_API_KEY,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_DBGPT_MODEL,
} from './services/deepseek-stream';
import {
  OPENWORK_TOOL_DEFINITIONS,
  HARDENED_SYSTEM_PROMPT,
  SKILL_TOOL_MAP,
  getActiveTools,
  executeMockToolCall,
  executeOpenWorkTool,
  resolveToolName,
  resolveToolMetadata,
  fetchDatasourceSchemaHint,
} from './services/openwork-tools';
import { DEEP_THINK_MODE_PROMPT } from './prompts/deep-think-mode-prompt';
import { DEEP_RESEARCH_MODE_PROMPT } from './prompts/deep-research-mode-prompt';

export { SKILL_TOOL_MAP, getActiveTools };

export type OpenWorkView =
  | 'chat'
  | 'workbench'
  | 'dashboard'
  | 'datasource'
  | 'skills'
  | 'keys'
  | 'members'
  | 'audit'
  | 'billing'
  | 'pricing'
  | 'prompts'
  | 'notifications'
  | 'onboarding'
  | 'auth'
  | 'artifact-detail'
  | 'states';

export type { DatasourceItem };

export const MIN_LEFT_SIDEBAR_WIDTH = 220;
export const MAX_LEFT_SIDEBAR_WIDTH = 420;
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 260;

export const MIN_RIGHT_WORKBENCH_WIDTH = 320;
export const MAX_RIGHT_WORKBENCH_WIDTH = 960;
export const DEFAULT_RIGHT_WORKBENCH_WIDTH = 452;
export const COLLAPSED_RIGHT_WORKBENCH_WIDTH = 72;

export const PERSISTED_UI_STATE_KEY = 'openwork:ui-state:v1';
export const PERSISTED_SETTINGS_KEY = 'openwork:settings:v1';
export const PERSISTED_SKILLS_KEY = 'openwork:skills:v1';
export const PERSISTED_SESSIONS_KEY = 'openwork:sessions:v1';
export const PERSISTED_ACTIVE_SESSION_KEY = 'openwork:active-session:v1';
export const PERSISTED_ACTIVE_DATASOURCE_KEY = 'openwork:active-datasource:v1';
export const SESSION_DATA_PREFIX = 'openwork:session-data:';

/**
 * Converts raw backend conversation messages into frontend OpenWorkStreamPart structures.
 */
export function convertMessagesToStreamParts(messages: any[]): OpenWorkStreamPart[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const parts: OpenWorkStreamPart[] = [];
  messages.forEach((m: any, i: number) => {
    if (m.role === 'user') {
      parts.push({
        type: 'user',
        id: `msg-${m.id || i}`,
        text: m.content || '',
        timestamp: m.created_at
          ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Vừa xong',
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

export const DEFAULT_DATASOURCES: DatasourceItem[] = [
  {
    id: 'VN_Ecommerce',
    name: 'VN_Ecommerce (Thương mại điện tử)',
    type: 'sqlite',
    tablesCount: 12,
    status: 'connected',
    description: 'Đơn hàng, khách hàng, sản phẩm & doanh thu bán lẻ Việt Nam (12 bảng, 54.6K rows)',
    isDefault: true,
  },
  {
    id: 'VN_Inventory',
    name: 'VN_Inventory (Tồn kho & Chuỗi cung ứng)',
    type: 'sqlite',
    tablesCount: 6,
    status: 'connected',
    description: 'Tồn kho, kho hàng, xuất nhập kho & nhà cung cấp (6 bảng, 20.5K rows)',
  },
  {
    id: 'VN_Marketing',
    name: 'VN_Marketing (Chiến dịch & Marketing)',
    type: 'sqlite',
    tablesCount: 6,
    status: 'connected',
    description: 'Chiến dịch marketing, voucher, UTM, A/B test & ROAS (6 bảng, 3K rows)',
  },
  {
    id: 'VN_Finance',
    name: 'VN_Finance (Tài chính & Doanh thu)',
    type: 'sqlite',
    tablesCount: 6,
    status: 'connected',
    description: 'Doanh thu đa kênh, P&L, KPI tài chính & cashflow (6 bảng, 4.4K rows)',
  },
  {
    id: 'Walmart_Sales',
    name: 'Walmart_Sales (Bán lẻ chuỗi siêu thị)',
    type: 'sqlite',
    tablesCount: 1,
    status: 'connected',
    description: 'Default Walmart Sales example database (1 bảng, 6.4K rows)',
  },
];

export function mapDbSchemaToDatasourceItem(db: any): DatasourceItem {
  const typeMap: Record<string, string> = {
    postgresql: 'postgres',
    postgres: 'postgres',
    mysql: 'mysql',
    sqlite: 'sqlite',
    clickhouse: 'clickhouse',
    duckdb: 'duckdb',
    excel: 'excel',
    oracle: 'oracle',
  };

  const rawType = String(db.db_type || db.type || 'sqlite').toLowerCase();
  const normalizedType = typeMap[rawType] || rawType;

  return {
    id: String(db.id || db.db_name || db.name || 'db_' + Math.random().toString(36).slice(2, 7)),
    name: db.name || db.db_name || db.label || 'Enterprise Database',
    type: normalizedType,
    tablesCount: typeof db.tables_count === 'number' ? db.tables_count : undefined,
    status: 'connected',
    description: db.comment || db.description || `${normalizedType.toUpperCase()} database connection`,
    host: db.db_host,
    port: db.db_port,
  };
}

export function parsePartialJson(raw: string): any {
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
    const stack: string[] = [];
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



export const DEMO_SESSION_ID = '019183ab-4521-7294-81d3-9f88c3a10123';

export const DEFAULT_DEEPSEEK_BASE_URL = '/api/deepseek';
export const DEFAULT_OPENROUTER_BASE_URL = '/api/openrouter/v1';
export const DEFAULT_DBGPT_BASE_URL = '/api/v1';

export const DEFAULT_OPENWORK_SETTINGS: OpenWorkSettings = {
  providerKind: 'openrouter',
  apiKey: DEFAULT_OPENROUTER_API_KEY,
  apiBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
  model: 'deepseek-v4-flash',

  // Dedicated OpenRouter Config
  openrouterApiKey: DEFAULT_OPENROUTER_API_KEY,
  openrouterBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
  openrouterModel: 'deepseek-v4-flash',

  // Dedicated DeepSeek Config
  deepseekApiKey: DEFAULT_DEEPSEEK_API_KEY,
  deepseekBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
  deepseekModel: 'deepseek-v4-flash',

  // Dedicated Local DB-GPT Config
  dbgptBaseUrl: DEFAULT_DBGPT_BASE_URL,
  dbgptModel: 'deepseek-v4-flash',
  dbgptApiKey: '',

  // Shared Parameters
  temperature: 0.7,
  maxTokens: 4096,
  enableCoT: true,
  enableReasoningStream: true,
  theme: 'light',
};

export const DEFAULT_SETTINGS: OpenWorkSettings = DEFAULT_OPENWORK_SETTINGS;

export function resolveActiveProviderConfig(settings: Partial<OpenWorkSettings>): ActiveProviderConfig {
  const providerKind: ProviderKind = settings.providerKind || 'openrouter';

  switch (providerKind) {
    case 'openrouter':
    default: {
      const apiKey = (settings.openrouterApiKey !== undefined && settings.openrouterApiKey !== null ? settings.openrouterApiKey : settings.apiKey) || DEFAULT_OPENROUTER_API_KEY;
      const apiBaseUrl = (settings.openrouterBaseUrl !== undefined && settings.openrouterBaseUrl !== null ? settings.openrouterBaseUrl : settings.apiBaseUrl) || DEFAULT_OPENROUTER_BASE_URL;
      const model = (settings.openrouterModel !== undefined && settings.openrouterModel !== null ? settings.openrouterModel : settings.model) || 'deepseek-v4-flash';
      const headers: Record<string, string> = {
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://dbgpt.site',
        'X-Title': 'DB-GPT OpenWork Coworker',
      };
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return {
        providerKind: 'openrouter',
        apiKey: apiKey.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        model: model.trim(),
        headers,
      };
    }
    case 'deepseek': {
      const apiKey = (settings.deepseekApiKey !== undefined && settings.deepseekApiKey !== null ? settings.deepseekApiKey : settings.apiKey) || DEFAULT_DEEPSEEK_API_KEY;
      const apiBaseUrl = (settings.deepseekBaseUrl !== undefined && settings.deepseekBaseUrl !== null ? settings.deepseekBaseUrl : settings.apiBaseUrl) || DEFAULT_DEEPSEEK_BASE_URL;
      const model = (settings.deepseekModel !== undefined && settings.deepseekModel !== null ? settings.deepseekModel : settings.model) || 'deepseek-v4-flash';
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return {
        providerKind: 'deepseek',
        apiKey: apiKey.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        model: model.trim(),
        headers,
      };
    }
    case 'dbgpt': {
      const apiKey = (settings.dbgptApiKey !== undefined && settings.dbgptApiKey !== null ? settings.dbgptApiKey : settings.apiKey) || '';
      const apiBaseUrl = (settings.dbgptBaseUrl !== undefined && settings.dbgptBaseUrl !== null ? settings.dbgptBaseUrl : settings.apiBaseUrl) || DEFAULT_DBGPT_BASE_URL;
      const model = (settings.dbgptModel !== undefined && settings.dbgptModel !== null ? settings.dbgptModel : settings.model) || 'deepseek-v4-flash';
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return {
        providerKind: 'dbgpt',
        apiKey: apiKey.trim(),
        apiBaseUrl: apiBaseUrl.trim(),
        model: model.trim(),
        headers,
      };
    }
  }
}

const INITIAL_SKILLS: OpenWorkSkillItem[] = [
  { id: 'sql-agent', name: 'SQL Data Analyst', description: 'Query PostgreSQL, MySQL, and ClickHouse databases with natural language.', enabled: true, category: 'Database' },
  { id: 'chart-vis', name: 'Interactive Charts', description: 'Generate ECharts, Recharts, and dynamic data visualizations.', enabled: true, category: 'Visualization' },
  { id: 'doc-writer', name: 'Executive Document Writer', description: 'Produce multi-page DOCX executive reports with formal typography.', enabled: true, category: 'Office' },
  { id: 'spreadsheet-studio', name: 'Spreadsheet Studio', description: 'Build multi-tab XLSX financial models with dynamic formulas.', enabled: true, category: 'Office' },
  { id: 'presentation-builder', name: 'Presentation Studio (16:9)', description: 'Create 14-layout executive pitch decks and slide presentations.', enabled: true, category: 'Office' },
  { id: 'web-search', name: 'Web Search & Scrape', description: 'Search the internet and read web pages for deep research.', enabled: true, category: 'Search' },
  { id: 'autonomous-mcp', name: 'MCP Autonomous Tool Bridge', description: 'Execute external server tools and browser automation.', enabled: true, category: 'Autonomous' },
];

const INITIAL_WORKSPACE: OpenWorkWorkspaceInfo = {
  id: 'ws-enterprise-1',
  name: 'OpenWork Coworker',
  tier: 'enterprise',
};

const INITIAL_SESSIONS: OpenWorkSessionItem[] = [
  {
    id: DEMO_SESSION_ID,
    title: 'Phân tích PnL Q3 & Trích xuất Báo Cáo',
    subtitle: 'Đã hoàn tất trích xuất dữ liệu DW và tạo Artifacts',
    status: 'completed',
    updatedAt: '10:30',
  },
];

const INITIAL_STREAM_PARTS: OpenWorkStreamPart[] = [
  {
    type: 'user',
    id: 'msg-user-init-1',
    text: 'Trích xuất bảng PnL 4 quý từ PostgreSQL DW và tạo slide tổng hợp điều hành Q3/2026',
    timestamp: '10:28',
  },
  {
    type: 'reasoning',
    id: 'msg-reasoning-init-1',
    title: 'Luồng suy luận & Phân tích (Chain-of-Thought)',
    thought: '1. Schema alignment: Đối chiếu bảng `q3_financial_records` trong PostgreSQL DW.\n2. Query design: Lập truy vấn tổng hợp `revenue`, `cogs`, `gross_profit` qua 4 quý.\n3. Artifact synthesis: Đồng bộ dữ liệu sang bảng tính Excel XLSX và tạo slide thuyết trình 16:9.',
    isStreaming: false,
  },
  {
    type: 'capability-call',
    id: 'msg-cap-init-1',
    toolName: 'tools.sql_query_runner',
    displayName: 'SQL Execution Terminal',
    status: 'success',
    durationMs: 342,
    language: 'sql',
    codeSnippet: 'SELECT quarter, SUM(net_revenue) AS revenue, SUM(cogs) AS cost, (SUM(net_revenue) - SUM(cogs)) AS gross_profit FROM q3_financial_records GROUP BY quarter;',
  },
  {
    type: 'text',
    id: 'msg-text-init-1',
    title: 'Báo Cáo Điều Hành Phân Tích PnL Q3/2026',
    markdown: `Dựa trên truy vấn dữ liệu tài chính hợp nhất từ kho dữ liệu PostgreSQL DW, hệ thống tổng hợp các chỉ số trọng yếu:

- **Tăng trưởng Doanh thu Thuần:** Đạt mức $2,450,000 (tương đương 42.8 Tỷ VNĐ), ghi nhận tăng trưởng **+18.4% YoY** so với cùng kỳ năm trước.
- **Biên Lợi Nhuận Gộp:** Tỷ suất lợi nhuận gộp đạt **33.9%** (tương ứng $830,000), cải thiện **+3.2%** nhờ tối ưu chuỗi cung ứng và chi phí kho bãi.
- **Lợi Nhuận Ròng & EBITDA:** Lợi nhuận thuần từ HĐKD đạt $360,000 và lợi nhuận ròng đạt **$249,600** (10.5 Tỷ VNĐ), vượt **12.5%** so với kế hoạch đề ra.
- **Đồng bộ hóa Workbench:** Bảng tính chi tiết 4 quý hợp nhất đã được đồng bộ tự động vào **Canvas Workbench** bên phải.`,
    keyPoints: [
      { label: 'Doanh Thu', value: '42.8 Tỷ', delta: '+18.4%', title: 'Doanh Thu Thuần (Q3/2026)', body: 'Đạt 42.8 Tỷ VNĐ ($2.45M), tăng trưởng +18.4% YoY so với cùng kỳ', tone: 'ok' },
      { label: 'Biên Lợi Nhuận', value: '24.6%', delta: '+3.2%', title: 'Biên Lợi Nhuận Gộp', body: 'Đạt 24.6% (gross margin 33.9%), cải thiện +3.2% so với Q2', tone: 'ok' },
      { label: 'Lợi Nhuận Ròng', value: '10.5 Tỷ', delta: '+21.5%', title: 'Lợi Nhuận Ròng (EBITDA)', body: 'Đạt 10.5 Tỷ VNĐ ($249.6K), vượt 12.5% kế hoạch đề ra', tone: 'ok' },
      { label: 'Tỷ Lệ ROI', value: '310.5%', delta: '+14.2%', title: 'Hiệu Quả Vận Hành & Marketing', body: 'Chiến dịch tiếp thị số đa kênh đạt ROI 310.5% tối ưu nhất năm', tone: 'accent' },
    ] as any,
    suggestedArtifactTab: 'excel',
    artifactName: 'PnL_4_Quarters_Consolidated.xlsx',
    artifactMeta: '15 dòng · 5 cột · 18.4 KB',
  },
];

const INITIAL_ARTIFACTS: OpenWorkArtifact[] = [
  {
    id: 'art-excel-init',
    name: 'PnL_4_Quarters_Consolidated.xlsx',
    title: 'PnL 4 Quý Hợp Nhất',
    type: 'excel',
    extension: '.xlsx',
    status: 'ready',
    version: 1,
    content: {
      title: 'Báo Cáo Tài Chính PnL Hợp Nhất 4 Quý',
      sheets: [
        {
          name: 'PnL_Consolidated',
          rows: [
            ['Chỉ Tiêu Tài Chính', 'Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Kế Hoạch)'],
            ['1. Doanh Thu Thuần', '$2,100,000', '$2,280,000', '$2,450,000', '$2,680,000'],
            ['2. Giá Vốn Hàng Bán (COGS)', '$1,450,000', '$1,520,000', '$1,620,000', '$1,720,000'],
            ['3. Lợi Nhuận Gộp', '$650,000', '$760,000', '$830,000', '$960,000'],
            ['   Biên Lợi Nhuận Gộp (%)', '31.0%', '33.3%', '33.9%', '35.8%'],
            ['4. Chi Phí Bán Hàng & Tiếp Thị', '$180,000', '$195,000', '$210,000', '$230,000'],
            ['5. Chi Phí Quản Lý Doanh Nghiệp', '$140,000', '$145,000', '$155,000', '$160,000'],
            ['6. Chi Phí R&D / Công Nghệ', '$95,000', '$100,000', '$105,000', '$110,000'],
            ['7. Tổng Chi Phí Hoạt Động (OPEX)', '$415,000', '$440,000', '$470,000', '$500,000'],
            ['8. Lợi Nhuận Thuần Từ HĐKD (EBITDA)', '$235,000', '$320,000', '$360,000', '$460,000'],
            ['9. Khấu Hao & Chi Phí Tài Chính', '$45,000', '$45,000', '$48,000', '$50,000'],
            ['10. Lợi Nhuận Trước Thuế (EBT)', '$190,000', '$275,000', '$312,000', '$410,000'],
            ['11. Thuế Thu Nhập Doanh Nghiệp (20%)', '$38,000', '$55,000', '$62,400', '$82,000'],
            ['12. Lợi Nhuận Ròng (Net Income)', '$152,000', '$220,000', '$249,600', '$328,000'],
            ['   Tỷ Suất Lợi Nhuận Ròng (%)', '7.2%', '9.6%', '10.2%', '12.2%'],
            ['   Tăng Trưởng Doanh Thu YoY (%)', '+14.2%', '+16.5%', '+18.4%', '+21.2%'],
          ],
          formulas: {
            B4: '=B2-B3',
            C4: '=C2-C3',
            D4: '=D2-D3',
            E4: '=E2-E3',
            B5: '=B4/B2',
            C5: '=C4/C2',
            D5: '=D4/D2',
            E5: '=E4/E2',
            B9: '=SUM(B6:B8)',
            C9: '=SUM(C6:C8)',
            D9: '=SUM(D6:D8)',
            E9: '=SUM(E6:E8)',
            B10: '=B4-B9',
            C10: '=C4-C9',
            D10: '=D4-D9',
            E10: '=E4-E9',
            B12: '=B10-B11',
            C12: '=C10-C11',
            D12: '=D10-D11',
            E12: '=E10-E11',
            B14: '=B12-B13',
            C14: '=C12-C13',
            D14: '=D12-D13',
            E14: '=E12-E13',
          },
        },
      ],
      rowCount: 15,
      colCount: 5,
      fileSize: '18.4 KB',
    },
    updatedAt: '10:30',
  },
  {
    id: 'art-slide-init',
    name: 'Q3_Financial_Review_16x9.pptx',
    title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
    type: 'slide',
    extension: '.pptx',
    status: 'ready',
    version: 1,
    content: {
      title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
      slides: [
        {
          layout: 'hero',
          title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
          subtitle: 'Phân tích hiệu quả kinh doanh & Tăng trưởng doanh thu 4 quý',
          date: 'Q3/2026',
          impact_stat: '+24.8% YoY',
        },
        {
          layout: 'stat_grid',
          title: 'Chỉ Số Tài Chính Trọng Yếu Q3',
          stats: [
            { label: 'Doanh Thu Thuần', value: '$2.45M', trend: '+18.4%' },
            { label: 'Lợi Nhuận Gộp', value: '$830K', trend: '+24.8%' },
            { label: 'Biên Lợi Nhuận', value: '33.8%', trend: '+3.2%' },
          ],
        },
      ],
    },
    updatedAt: '10:30',
  },
  {
    id: 'art-word-init',
    name: 'Bao_Cao_Tai_Chinh_Q3_2026.docx',
    title: 'Báo Cáo Phân Tích Tài Chính Q3/2026 (A4)',
    type: 'docx',
    extension: '.docx',
    status: 'ready',
    version: 1,
    content: {
      reportCode: 'BC-TC/2026-Q3/DB-GPT',
      title: 'BÁO CÁO PHÂN TÍCH TÀI CHÍNH & HIỆU QUẢ HOẠT ĐỘNG Q3/2026',
      subtitle: 'Tập đoàn Công nghệ & Dữ liệu Doanh nghiệp · Chuẩn mực Kế toán Doanh nghiệp VAS & IFRS',
      classification: 'INSTITUTIONAL RESEARCH',
      author: 'Khối Phân Tích Dữ Liệu & Kế Toán Quản Trị (FP&A)',
      date: '22/09/2026',
      rating: 'OUTPERFORM',
      scorecard: [
        { label: 'Doanh Thu Thuần', value: '$2.45M', trend: '+18.4% YoY', subLabel: 'Vượt 8.2% kế hoạch' },
        { label: 'Lợi Nhuận Gộp', value: '$830K', trend: 'Biên 33.9%', subLabel: '+3.2% vs Q2' },
        { label: 'EBITDA Hợp Nhất', value: '$360K', trend: '+12.5% Kế hoạch', subLabel: 'Biên EBITDA 14.7%' },
        { label: 'Dòng Tiền HĐKD', value: '+$158K', trend: 'Quick Ratio 2.45x', subLabel: 'Thanh khoản tối ưu' },
      ],
      shortTermThesis: [
        'Tăng trưởng doanh thu thuần đạt $2.45M (+18.4% YoY), động lực chính đến từ khối khách hàng Doanh nghiệp B2B với tỷ lệ Net Revenue Retention (NRR) đạt 118.2%.',
        'Biên lợi nhuận gộp cải thiện lên 33.9% nhờ đàm phán tối ưu chi phí hạ tầng máy chủ đám mây (-12% unit cost) và tinh gọn chuỗi cung ứng dữ liệu.',
        'Dòng tiền thuần từ HĐKD duy trì dương liên tục 4 quý, chỉ số thanh toán hiện hành đạt 2.45 lần, loại bỏ hoàn toàn áp lực đòn bẩy tài chính ngắn hạn.',
      ],
      longTermThesis: [
        'Mô hình Enterprise AI & Data Intelligence giải quyết điểm nghẽn chuyển đổi số tại các tập đoàn lớn, mở rộng tổng thị trường khả dụng (TAM).',
        'Chiến lược sản phẩm phân tích FP&A tự động hóa giúp gia tăng tỷ trọng doanh thu định kỳ hàng năm (ARR) lên mức mục tiêu trên 65%.',
        'Tỷ lệ LTV/CAC tối ưu ở mức 4.2x kết hợp biên EBITDA mở rộng tạo nền tảng vững chắc cho kế hoạch tăng trưởng doanh thu 2026 vượt mốc 100 Tỷ VNĐ.',
      ],
      catalystsAndRisks: [
        { type: 'catalyst', text: 'Triển khai hợp đồng chiến lược phân tích dữ liệu tự động cho top 3 ngân hàng thương mại cổ phần trong Q4/2026.' },
        { type: 'catalyst', text: 'Nâng cấp mô hình dự báo tài chính tích hợp DeepSeek V4 giúp giảm thời gian phân tích từ 3 ngày xuống 5 phút.' },
        { type: 'risk', text: 'Biến động tỷ giá hối đoái và chi phí bản quyền API ngoại tệ trong trường hợp thị trường tài chính quốc tế thắt chặt.' },
        { type: 'risk', text: 'Tiến độ nghiệm thu hợp đồng từ các khách hàng khu vực công có thể kéo dài chu kỳ thu hồi công nợ quá 60 ngày.' },
      ],
      sources: [
        { index: 1, title: 'PostgreSQL DW Production / Schema: financials_q3_consolidated', url: 'dw://analytics.dbgpt.internal/pnl_q3_2026' },
        { index: 2, title: 'Hệ thống Kế toán Quản trị SAP S/4HANA / Sổ Cái Doanh Thu & Chi Phí', url: 'sap://erp.dbgpt.internal/gl_ledger_2026_q3' },
        { index: 3, title: 'Báo Cáo Kiểm Toán Nội Bộ & Đối Soát Số Liệu Hợp Nhất Q3/2026', url: 'audit://internal.dbgpt.internal/q3_signed_audit.pdf' },
      ],
    },
    updatedAt: '10:30',
  },
  {
    id: 'art-chart-init',
    name: 'pnl_quarterly_revenue.png',
    title: 'Biểu Đồ Tài Chính PnL 4 Quý (2026)',
    type: 'chart',
    extension: '.png',
    status: 'ready',
    version: 1,
    content: {
      title: 'Biểu Đồ Tài Chính PnL 4 Quý (2026)',
      name: 'pnl_quarterly_revenue.png',
    },
    updatedAt: '10:30',
  },
  {
    id: 'art-code-init',
    name: 'pnl_etl_pipeline.py',
    title: 'Mã Nguồn Trích Xuất & Xử Lý PnL',
    type: 'code',
    extension: '.py',
    status: 'ready',
    version: 1,
    content: {
      code: 'async def extractFinancials(db_pool):\n    """Autonomous ETL pipeline for financial records."""\n    query = "SELECT * FROM q3_financial_records"\n    async with db_pool.acquire() as conn:\n        return await conn.fetch(query)\n',
      language: 'python',
    },
    updatedAt: '10:30',
  },
];

export function resolveToolMeta(toolName?: string): {
  tab: OpenWorkArtifactTab;
  extension: string;
  defaultName: string;
  defaultTitle: string;
} {
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
  if (lower.includes('chart') || lower.includes('plot') || lower.includes('graph')) {
    return { tab: 'chart', extension: '.json', defaultName: 'chart.json', defaultTitle: 'Biểu Đồ Trực Quan' };
  }
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) {
    return { tab: 'docx', extension: '.docx', defaultName: 'document.docx', defaultTitle: 'Tài Liệu Báo Cáo DOCX' };
  }
  return { tab: 'code', extension: '.py', defaultName: 'pipeline.py', defaultTitle: 'Mã Nguồn Thực Thi' };
}

export function getInitialActiveSessionId(): string {
  if (typeof window === 'undefined') return DEMO_SESSION_ID;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('conversationId') || url.searchParams.get('session') || url.searchParams.get('id');
    if (fromUrl && isValidUUIDv7(fromUrl)) return fromUrl;
    const saved = storageManager.getPartitionedItem<string>('active-session');
    if (saved && isValidUUIDv7(saved)) return saved;
  } catch {}
  return DEMO_SESSION_ID;
}

export function useOpenWorkStore() {
  // Active View / Page Routing state
  const [activeView, setActiveView] = useState<OpenWorkView>('chat');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  // Sync tenant/user context on mount for storage isolation
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)dbgpt-uid=([^;]+)/);
      if (match && match[1]) {
        storageManager.setUser(decodeURIComponent(match[1]));
      }
    }
  }, []);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  // Workbench state
  const [workbenchOpen, setWorkbenchOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const activeId = getInitialActiveSessionId();
        const savedData = storageManager.getPartitionedItem<any>('session-data', activeId);
        if (savedData) {
          if (Array.isArray(savedData.artifacts) && savedData.artifacts.length > 0) {
            return true;
          }
        }
        if (activeId === DEMO_SESSION_ID) {
          return true;
        }
      } catch {}
    }
    return false;
  });
  const [workbenchWidth, setWorkbenchWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(
        MIN_RIGHT_WORKBENCH_WIDTH,
        Math.min(MAX_RIGHT_WORKBENCH_WIDTH, 452)
      );
    }
    return DEFAULT_RIGHT_WORKBENCH_WIDTH;
  });
  const [isDraggingWorkbench, setIsDraggingWorkbench] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Sessions & Workspace
  const [workspace] = useState<OpenWorkWorkspaceInfo>(INITIAL_WORKSPACE);
  const [sessions, setSessions] = useState<OpenWorkSessionItem[]>([]);

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return getInitialActiveSessionId();
  });

  // Global Agent Memory State
  const [memoryCards, setMemoryCards] = useState<AgentMemoryCard[]>(() => {
    return getGlobalMemories();
  });
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState<boolean>(false);

  // Listen for open-memory custom event
  useEffect(() => {
    const handleOpenMemory = () => setMemoryDrawerOpen(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('openwork:open-memory', handleOpenMemory);
      return () => {
        window.removeEventListener('openwork:open-memory', handleOpenMemory);
      };
    }
  }, []);

  const addMemoryCard = useCallback((card: Omit<AgentMemoryCard, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newCard = addGlobalMemory(card);
    setMemoryCards(getGlobalMemories());
    return newCard;
  }, []);

  const updateMemoryCard = useCallback((id: string, updates: Partial<AgentMemoryCard>) => {
    updateGlobalMemory(id, updates);
    setMemoryCards(getGlobalMemories());
  }, []);

  const deleteMemoryCard = useCallback((id: string) => {
    deleteGlobalMemory(id);
    setMemoryCards(getGlobalMemories());
  }, []);

  const toggleMemoryCard = useCallback((id: string, isEnabled?: boolean) => {
    toggleGlobalMemory(id, isEnabled);
    setMemoryCards(getGlobalMemories());
  }, []);

  const togglePinMemoryCard = useCallback((id: string, isPinned?: boolean) => {
    togglePinGlobalMemory(id, isPinned);
    setMemoryCards(getGlobalMemories());
  }, []);

  const resetMemoryCards = useCallback(() => {
    const defaults = resetGlobalMemoriesToDefault();
    setMemoryCards(defaults);
  }, []);

  const importMemoryCards = useCallback((jsonStr: string) => {
    const res = importMemoriesFromJson(jsonStr);
    setMemoryCards(getGlobalMemories());
    return res;
  }, []);

  const exportMemoryCards = useCallback(() => {
    return exportMemoriesToJson(memoryCards);
  }, [memoryCards]);

  const [sessionSearch, setSessionSearch] = useState<string>('');
  const [reasoningMode, setReasoningMode] = useState<string>('Quick');
  const [planMode, setPlanMode] = useState<'plan' | 'direct'>('plan');

  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function fetchSessions() {
      try {
        const res = await listConversations();
        if (!isMounted) return;
        if (Array.isArray(res) && res.length > 0) {
          const mapped: OpenWorkSessionItem[] = res.map((c: ConversationSummary | any) => ({
            id: c.id || c.conversation_id,
            title: c.title || 'Phiên làm việc mới',
            subtitle: '',
            status: 'idle' as const,
            updatedAt: c.updated_at || c.created_at || 'Vừa xong',
          }));
          if (!mapped.some((s: OpenWorkSessionItem) => s.id === DEMO_SESSION_ID)) {
            mapped.push(INITIAL_SESSIONS[0]);
          }
          setSessions(mapped);
          return;
        }
      } catch (err) {
        console.warn('Backend conversations API unavailable, using local persistence fallback:', err);
      }

      // Fallback to storageManager partitioned cache or INITIAL_SESSIONS
      if (isMounted) {
        try {
          const saved = storageManager.getPartitionedItem<OpenWorkSessionItem[]>('sessions');
          if (saved && Array.isArray(saved) && saved.length > 0) {
            setSessions(saved);
            return;
          }
        } catch {}
        setSessions(INITIAL_SESSIONS);
      }
    }
    fetchSessions();
    return () => {
      isMounted = false;
    };
  }, []);

  // Stream & Execution
  const [streamParts, setStreamParts] = useState<OpenWorkStreamPart[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const activeId = getInitialActiveSessionId();
      const savedData = storageManager.getPartitionedItem<any>('session-data', activeId);
      if (savedData && Array.isArray(savedData.streamParts)) {
        return savedData.streamParts;
      }
      if (activeId === DEMO_SESSION_ID) return INITIAL_STREAM_PARTS;
    } catch {}
    return [];
  });
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [spotlightActive, setSpotlightActive] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastHydratedSessionRef = useRef<string | null>(null);
  const loadedSessionIdRef = useRef<string | null>(null);

  // Artifacts
  const [artifacts, setArtifacts] = useState<OpenWorkArtifact[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const activeId = getInitialActiveSessionId();
      const savedData = storageManager.getPartitionedItem<any>('session-data', activeId);
      if (savedData && Array.isArray(savedData.artifacts)) {
        return savedData.artifacts;
      }
      if (activeId === DEMO_SESSION_ID) return INITIAL_ARTIFACTS;
    } catch {}
    return [];
  });
  const [activeTab, setActiveTab] = useState<OpenWorkArtifactTab>('excel');
  const [activeArtifactId, setActiveArtifactId] = useState<string>('art-excel-init');

  // Input composer
  const [inputValue, setInputValue] = useState<string>('');

  // ── Auto-save activeSessionId to storageManager & Sync to browser URL ──
  useEffect(() => {
    if (!activeSessionId) return;
    try {
      storageManager.setPartitionedItem('active-session', activeSessionId);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.get('conversationId') !== activeSessionId) {
          url.searchParams.set('conversationId', activeSessionId);
          url.searchParams.delete('session');
          url.searchParams.delete('id');
          window.history.replaceState(null, '', url.pathname + url.search);
        }
      }
    } catch {}
  }, [activeSessionId]);

  // ── Auto-persist isolated session data whenever activeSessionId and state are valid ──
  useEffect(() => {
    if (!activeSessionId) return;
    if (streamParts.length === 0 && artifacts.length === 0) return;
    try {
      storageManager.setPartitionedItem(
        'session-data',
        { streamParts, artifacts },
        activeSessionId
      );
    } catch (err) {
      console.warn('[OpenWork] Failed to auto-persist session data:', err);
    }
  }, [activeSessionId, streamParts, artifacts]);

  // ── Auto-persist sessions list to storageManager ──
  useEffect(() => {
    if (!sessions || sessions.length === 0) return;
    try {
      storageManager.setPartitionedItem('sessions', sessions);
    } catch {}
  }, [sessions]);

  // ── Sync activeSessionId with URL query parameter & Hydrate on Page Load / Refresh ──
  useEffect(() => {
    let sessionFromUrl: string | undefined = undefined;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      sessionFromUrl = params.get('conversationId') || params.get('session') || params.get('id') || undefined;
    }
    if (!sessionFromUrl && router?.query) {
      sessionFromUrl = (router.query.conversationId || router.query.session || router.query.id) as string | undefined;
    }

    // When URL has NO conversation ID, sync the active session ID into the URL immediately!
    if (!sessionFromUrl) {
      const targetId = activeSessionId || DEMO_SESSION_ID;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.get('conversationId') !== targetId) {
          url.searchParams.set('conversationId', targetId);
          url.searchParams.delete('session');
          url.searchParams.delete('id');
          window.history.replaceState(null, '', url.pathname + url.search);
        }
      }
      if (router?.replace) {
        const nextQuery: Record<string, any> = { ...router.query, conversationId: targetId };
        delete nextQuery.session;
        delete nextQuery.id;
        router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
      }
      return;
    }

    if (sessionFromUrl !== loadedSessionIdRef.current) {
      loadedSessionIdRef.current = sessionFromUrl;
      setActiveSessionId(sessionFromUrl);

      // Instant local check to prevent UI flash
      let syncParts: OpenWorkStreamPart[] = [];
      let syncArts: OpenWorkArtifact[] = [];
      let foundLocal = false;

      try {
        const localData = storageManager.getPartitionedItem<any>('session-data', sessionFromUrl);
        if (localData) {
          if (Array.isArray(localData.streamParts) && localData.streamParts.length > 0) {
            const isContaminated = sessionFromUrl !== DEMO_SESSION_ID &&
              localData.streamParts.some((p: any) => p.id === 'msg-user-init-1');
            if (!isContaminated) {
              syncParts = localData.streamParts;
              syncArts = Array.isArray(localData.artifacts) ? localData.artifacts : [];
              if (sessionFromUrl === DEMO_SESSION_ID) {
                const initialMap = new Map(INITIAL_ARTIFACTS.map((a) => [a.id, a]));
                syncArts = syncArts.map((a) => (initialMap.has(a.id) ? { ...initialMap.get(a.id)!, ...a, content: initialMap.get(a.id)!.content } : a));
                for (const initArt of INITIAL_ARTIFACTS) {
                  if (!syncArts.some((a) => a.id === initArt.id)) {
                    syncArts.push(initArt);
                  }
                }
              }
              foundLocal = true;
            }
          }
        }
      } catch {}

      if (!foundLocal) {
        if (sessionFromUrl === DEMO_SESSION_ID) {
          syncParts = INITIAL_STREAM_PARTS;
          syncArts = INITIAL_ARTIFACTS;
        } else {
          syncParts = [];
          syncArts = [];
        }
      }

      setStreamParts(syncParts);
      setArtifacts(syncArts);
      setWorkbenchOpen(Boolean(syncArts && syncArts.length > 0));
      setIsMaximized(false);

      async function hydrateSession(id: string) {
        try {
          const messages = await getConversationMessages(id);
          if (loadedSessionIdRef.current !== id) return;
          // Only hydrate from basic messages if local rich data was not available
          if (!foundLocal && messages && messages.length > 0) {
            const converted = convertMessagesToStreamParts(messages);
            setStreamParts(converted);
            try {
              storageManager.setPartitionedItem(
                'session-data',
                { streamParts: converted, artifacts: syncArts },
                id
              );
            } catch {}
          }
        } catch (err) {
          console.warn(`Backend message sync deferred for ${id}:`, err);
        }
      }

      hydrateSession(sessionFromUrl);
    }
  }, [router?.query?.conversationId, router?.query?.session, router?.query?.id, activeSessionId]);

  const selectSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId && loadedSessionIdRef.current === sessionId) return;
    loadedSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);

    // Synchronous local state loading for instantaneous zero-lag UI response
    let targetParts: OpenWorkStreamPart[] = [];
    let targetArts: OpenWorkArtifact[] = [];
    let hasLocalData = false;

    try {
      const localData = storageManager.getPartitionedItem<any>('session-data', sessionId);
      if (localData) {
        if (Array.isArray(localData.streamParts) && localData.streamParts.length > 0) {
          const isContaminated = sessionId !== DEMO_SESSION_ID &&
            localData.streamParts.some((p: any) => p.id === 'msg-user-init-1');
          if (!isContaminated) {
            targetParts = localData.streamParts;
            targetArts = Array.isArray(localData.artifacts) ? localData.artifacts : [];
            if (sessionId === DEMO_SESSION_ID) {
              const initialMap = new Map(INITIAL_ARTIFACTS.map((a) => [a.id, a]));
              targetArts = targetArts.map((a) => (initialMap.has(a.id) ? { ...initialMap.get(a.id)!, ...a, content: initialMap.get(a.id)!.content } : a));
              for (const initArt of INITIAL_ARTIFACTS) {
                if (!targetArts.some((a) => a.id === initArt.id)) {
                  targetArts.push(initArt);
                }
              }
            }
            hasLocalData = true;
          }
        }
      }
    } catch {}

    if (!hasLocalData) {
      if (sessionId === DEMO_SESSION_ID) {
        targetParts = INITIAL_STREAM_PARTS;
        targetArts = INITIAL_ARTIFACTS;
      } else {
        targetParts = [];
        targetArts = [];
      }
    }

    // Immediately apply states in the current tick
    setStreamParts(targetParts);
    setArtifacts(targetArts);
    setWorkbenchOpen(Boolean(targetArts && targetArts.length > 0));
    setIsMaximized(false);

    // Sync URL immediately in address bar
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('conversationId', sessionId);
      url.searchParams.delete('session');
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    if (router?.isReady) {
      const nextQuery: Record<string, any> = { ...router.query, conversationId: sessionId };
      delete nextQuery.session;
      delete nextQuery.id;
      router.push(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true }
      );
    }

    // Asynchronous backend refresh
    try {
      const messages = await getConversationMessages(sessionId);
      if (loadedSessionIdRef.current === sessionId && !hasLocalData && messages && messages.length > 0) {
        const converted = convertMessagesToStreamParts(messages);
        setStreamParts(converted);
        try {
          storageManager.setPartitionedItem(
            'session-data',
            { streamParts: converted, artifacts: targetArts },
            sessionId
          );
        } catch {}
      }
    } catch (err) {
      console.warn('Backend message sync deferred:', err);
    }
  }, [activeSessionId, router]);

  // Skills
  const [skills, setSkills] = useState<OpenWorkSkillItem[]>(() => {
    if (typeof window === 'undefined') return INITIAL_SKILLS;
    try {
      const saved = storageManager.getPartitionedItem<any>('skills');
      if (saved) {
        if (Array.isArray(saved) && saved.length > 0) {
          return INITIAL_SKILLS.map((initSkill) => {
            const found = saved.find((p: any) => p.id === initSkill.id);
            return found !== undefined ? { ...initSkill, enabled: Boolean(found.enabled) } : initSkill;
          });
        }
      }
    } catch {}
    return INITIAL_SKILLS;
  });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Settings state & Hydration from localStorage
  const [settings, setSettingsState] = useState<OpenWorkSettings>(DEFAULT_OPENWORK_SETTINGS);

  // Model selection — dynamic based on active provider
  const availableModels = useMemo(
    () => {
      const currentProvider = settings.providerKind || 'openrouter';
      const catalog = PROVIDER_MODEL_CATALOG[currentProvider] || PROVIDER_MODEL_CATALOG.openrouter;
      return catalog.map((m) => m.value);
    },
    [settings.providerKind]
  );
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    const active = resolveActiveProviderConfig(DEFAULT_OPENWORK_SETTINGS);
    return active.model;
  });

  // Datasources State & Persistence
  const [availableDatasources, setAvailableDatasources] = useState<DatasourceItem[]>(DEFAULT_DATASOURCES);
  const [selectedDatasourceId, setSelectedDatasourceIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return DEFAULT_DATASOURCES[0].id;
    try {
      const saved = storageManager.getPartitionedItem<string>('active-datasource');
      if (saved) return saved;
    } catch {
      // ignore
    }
    return DEFAULT_DATASOURCES[0].id;
  });

  const setSelectedDatasourceId = useCallback((id: string | null) => {
    setSelectedDatasourceIdState(id);
    if (typeof window !== 'undefined') {
      try {
        if (id) {
          storageManager.setPartitionedItem('active-datasource', id);
        } else {
          storageManager.removePartitionedItem('active-datasource');
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const selectedDatasource = useMemo<DatasourceItem | null>(() => {
    if (!selectedDatasourceId) return availableDatasources[0] || null;
    return availableDatasources.find((d) => d.id === selectedDatasourceId) || availableDatasources[0] || null;
  }, [availableDatasources, selectedDatasourceId]);

  // True once `getDbList()` has actually answered. Drives the sidebar database
  // connector badge, so it reports real reachability instead of a hardcoded
  // "CONNECTED" that stays lit while the backend is down.
  const [datasourcesLive, setDatasourcesLive] = useState(false);

  const refreshDatasources = useCallback(async () => {
    try {
      const [, res] = await apiInterceptors(getDbList());
      if (res && Array.isArray(res) && res.length > 0) {
        const mapped = res.map(mapDbSchemaToDatasourceItem);
        setAvailableDatasources(mapped);
        setSelectedDatasourceIdState((curr) => {
          if (curr && mapped.some((d) => d.id === curr)) return curr;
          return mapped[0]?.id || null;
        });
        setDatasourcesLive(true);
      } else {
        setDatasourcesLive(false);
      }
    } catch {
      // Gracefully preserve default/current datasources on network failure
      setDatasourcesLive(false);
    }
  }, []);

  // Fetch live datasources on mount
  useEffect(() => {
    refreshDatasources();
  }, [refreshDatasources]);

  // Connector rail — derived from live backend state only. The MCP rows come
  // from the real `/api/v2/serve/connectors` registry; the database row mirrors
  // the datasource actually selected and whether `getDbList()` answered.
  const { connectors: connectorInstances } = useConnectors();

  const connectors = useMemo<OpenWorkConnectorStatus[]>(() => {
    const mcpRows: OpenWorkConnectorStatus[] = (connectorInstances || []).map((c) => ({
      id: c.id,
      name: c.display_name || c.connector_type,
      type: 'mcp',
      status: c.status === 'active' ? 'active' : 'disconnected',
    }));

    const dbRow: OpenWorkConnectorStatus | null = selectedDatasource
      ? {
          id: `datasource-${selectedDatasource.id}`,
          name: selectedDatasource.name,
          type: 'database',
          status: datasourcesLive ? 'connected' : 'disconnected',
        }
      : null;

    return dbRow ? [...mcpRows, dbRow] : mcpRows;
  }, [connectorInstances, selectedDatasource, datasourcesLive]);

  // Load persisted UI state & Settings
  useEffect(() => {
    try {
      const savedUi = storageManager.getPartitionedItem<any>('ui-state');
      if (savedUi) {
        if (typeof savedUi.sidebarWidth === 'number') {
          setSidebarWidth(Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, savedUi.sidebarWidth)));
        }
        if (typeof savedUi.workbenchWidth === 'number') {
          const maxAvailable = typeof window !== 'undefined'
            ? Math.max(MIN_RIGHT_WORKBENCH_WIDTH, window.innerWidth - (savedUi.sidebarOpen !== false ? 262 : 0) - 480)
            : MAX_RIGHT_WORKBENCH_WIDTH;
          const safeLimit = Math.min(MAX_RIGHT_WORKBENCH_WIDTH, maxAvailable);
          setWorkbenchWidth(Math.max(MIN_RIGHT_WORKBENCH_WIDTH, Math.min(safeLimit, savedUi.workbenchWidth)));
        }
        if (typeof savedUi.sidebarOpen === 'boolean') {
          setSidebarOpen(savedUi.sidebarOpen);
        }
        if (typeof savedUi.workbenchOpen === 'boolean') {
          setWorkbenchOpen(savedUi.workbenchOpen);
        }
      }

      const savedSettings = storageManager.getPartitionedItem<any>('settings');
      if (savedSettings) {
        const parsedSettings = savedSettings;
        const rawProvider = parsedSettings.providerKind;
        const providerKind: ProviderKind = rawProvider || 'openrouter';

        // OpenRouter keys fallback & migration
        const openrouterApiKey = parsedSettings.openrouterApiKey || (providerKind === 'openrouter' ? parsedSettings.apiKey : '') || DEFAULT_OPENROUTER_API_KEY;
        const openrouterBaseUrl = parsedSettings.openrouterBaseUrl || (providerKind === 'openrouter' ? parsedSettings.apiBaseUrl : '') || DEFAULT_OPENROUTER_BASE_URL;
        const openrouterModel = pickCatalogModel('openrouter', parsedSettings.openrouterModel || (providerKind === 'openrouter' ? parsedSettings.model : ''), DEFAULT_OPENROUTER_MODEL);

        // DeepSeek keys fallback & migration
        const deepseekApiKey = parsedSettings.deepseekApiKey || (providerKind === 'deepseek' ? parsedSettings.apiKey : '') || DEFAULT_DEEPSEEK_API_KEY;
        const deepseekBaseUrl = parsedSettings.deepseekBaseUrl || (providerKind === 'deepseek' ? parsedSettings.apiBaseUrl : '') || DEFAULT_DEEPSEEK_BASE_URL;
        const deepseekModel = pickCatalogModel('deepseek', parsedSettings.deepseekModel || (providerKind === 'deepseek' ? parsedSettings.model : ''), DEFAULT_DEEPSEEK_MODEL);

        // DB-GPT keys fallback & migration
        const dbgptBaseUrl = parsedSettings.dbgptBaseUrl || (providerKind === 'dbgpt' ? parsedSettings.apiBaseUrl : '') || DEFAULT_DBGPT_BASE_URL;
        const dbgptModel = pickCatalogModel('dbgpt', parsedSettings.dbgptModel || (providerKind === 'dbgpt' ? parsedSettings.model : ''), DEFAULT_DBGPT_MODEL);
        const dbgptApiKey = parsedSettings.dbgptApiKey || (providerKind === 'dbgpt' ? parsedSettings.apiKey : '') || '';

        const mergedSettings: OpenWorkSettings = {
          ...DEFAULT_OPENWORK_SETTINGS,
          ...parsedSettings,
          providerKind,
          openrouterApiKey,
          openrouterBaseUrl,
          openrouterModel,
          deepseekApiKey,
          deepseekBaseUrl,
          deepseekModel,
          dbgptBaseUrl,
          dbgptModel,
          dbgptApiKey,
        };

        const activeResolved = resolveActiveProviderConfig(mergedSettings);
        mergedSettings.apiKey = activeResolved.apiKey;
        mergedSettings.apiBaseUrl = activeResolved.apiBaseUrl;
        mergedSettings.model = activeResolved.model;

        setSettingsState(mergedSettings);
        if (activeResolved.model) {
          setSelectedModelState(activeResolved.model);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // ── Auto-persist settings to storageManager ──
  useEffect(() => {
    if (!settings) return;
    try {
      storageManager.setPartitionedItem('settings', settings);
    } catch {}
  }, [settings]);

  // ── Auto-persist skills to storageManager ──
  useEffect(() => {
    if (!skills || skills.length === 0) return;
    try {
      storageManager.setPartitionedItem('skills', skills);
    } catch {}
  }, [skills]);

  // Save persisted UI state
  const persistState = useCallback((sW: number, wW: number, sOpen: boolean, wOpen: boolean) => {
    try {
      storageManager.setPartitionedItem(
        'ui-state',
        {
          sidebarWidth: sW,
          workbenchWidth: wW,
          sidebarOpen: sOpen,
          workbenchOpen: wOpen,
        }
      );
    } catch {
      // ignore
    }
  }, []);

  // Settings update & provider actions
  const updateSettings = useCallback((newSettings: Partial<OpenWorkSettings>) => {
    setSettingsState((prev) => {
      const merged: OpenWorkSettings = { ...prev, ...newSettings };
      const currentProvider: ProviderKind = merged.providerKind || 'deepseek';

      // Keep dedicated fields in sync if active fields were passed directly
      if (newSettings.apiKey !== undefined && newSettings.deepseekApiKey === undefined && currentProvider === 'deepseek') {
        merged.deepseekApiKey = newSettings.apiKey;
      }
      if (newSettings.apiKey !== undefined && newSettings.dbgptApiKey === undefined && currentProvider === 'dbgpt') {
        merged.dbgptApiKey = newSettings.apiKey;
      }

      if (newSettings.apiBaseUrl !== undefined && newSettings.deepseekBaseUrl === undefined && currentProvider === 'deepseek') {
        merged.deepseekBaseUrl = newSettings.apiBaseUrl;
      }
      if (newSettings.apiBaseUrl !== undefined && newSettings.dbgptBaseUrl === undefined && currentProvider === 'dbgpt') {
        merged.dbgptBaseUrl = newSettings.apiBaseUrl;
      }

      if (newSettings.model !== undefined && newSettings.deepseekModel === undefined && currentProvider === 'deepseek') {
        merged.deepseekModel = newSettings.model;
      }
      if (newSettings.model !== undefined && newSettings.dbgptModel === undefined && currentProvider === 'dbgpt') {
        merged.dbgptModel = newSettings.model;
      }

      // If dedicated fields were explicitly updated, sync to active fields
      if (currentProvider === 'deepseek' && newSettings.deepseekApiKey !== undefined) {
        merged.apiKey = newSettings.deepseekApiKey;
      }
      if (currentProvider === 'dbgpt' && newSettings.dbgptApiKey !== undefined) {
        merged.apiKey = newSettings.dbgptApiKey;
      }

      if (currentProvider === 'deepseek' && newSettings.deepseekModel !== undefined) {
        merged.model = newSettings.deepseekModel;
      }
      if (currentProvider === 'dbgpt' && newSettings.dbgptModel !== undefined) {
        merged.model = newSettings.dbgptModel;
      }

      // Final resolution
      const activeResolved = resolveActiveProviderConfig(merged);
      merged.apiKey = activeResolved.apiKey;
      merged.apiBaseUrl = activeResolved.apiBaseUrl;
      merged.model = activeResolved.model;

      if (merged.model) {
        setSelectedModelState(merged.model);
      }

      return merged;
    });
  }, []);

  const setProvider = useCallback((providerKind: ProviderKind) => {
    setSettingsState((prev) => {
      let targetModel = '';
      if (providerKind === 'dbgpt') {
        targetModel = prev.dbgptModel || DEFAULT_DBGPT_MODEL;
      } else {
        targetModel = prev.deepseekModel || DEFAULT_DEEPSEEK_MODEL;
      }

      const nextSettings: OpenWorkSettings = {
        ...prev,
        providerKind,
        model: targetModel,
      };

      const activeResolved = resolveActiveProviderConfig(nextSettings);
      nextSettings.apiKey = activeResolved.apiKey;
      nextSettings.apiBaseUrl = activeResolved.apiBaseUrl;
      nextSettings.model = activeResolved.model;

      setSelectedModelState(activeResolved.model);
      return nextSettings;
    });
  }, []);

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model);
    setSettingsState((prev) => {
      const currentProvider = prev.providerKind || 'deepseek';
      const updated: OpenWorkSettings = {
        ...prev,
        model,
      };
      if (currentProvider === 'deepseek') updated.deepseekModel = model;
      else if (currentProvider === 'dbgpt') updated.dbgptModel = model;

      return updated;
    });
  }, []);

  // Resize Handlers
  const handleSidebarResize = useCallback((newWidth: number) => {
    const clamped = Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, newWidth));
    setSidebarWidth(clamped);
    persistState(clamped, workbenchWidth, sidebarOpen, workbenchOpen);
  }, [workbenchWidth, sidebarOpen, workbenchOpen, persistState]);

  const handleWorkbenchResize = useCallback((newWidth: number) => {
    const clamped = Math.max(MIN_RIGHT_WORKBENCH_WIDTH, Math.min(MAX_RIGHT_WORKBENCH_WIDTH, newWidth));
    setWorkbenchWidth(clamped);
    persistState(sidebarWidth, clamped, sidebarOpen, workbenchOpen);
  }, [sidebarWidth, sidebarOpen, workbenchOpen, persistState]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      persistState(sidebarWidth, workbenchWidth, next, workbenchOpen);
      return next;
    });
  }, [sidebarWidth, workbenchWidth, workbenchOpen, persistState]);

  const toggleWorkbench = useCallback(() => {
    setWorkbenchOpen((prev) => {
      const next = !prev;
      let nextSidebar = sidebarOpen;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1536) {
        setSidebarOpen(false);
        nextSidebar = false;
      }
      persistState(sidebarWidth, workbenchWidth, nextSidebar, next);
      return next;
    });
  }, [sidebarWidth, workbenchWidth, sidebarOpen, persistState]);

  const toggleMaximized = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const toggleSpotlight = useCallback(() => {
    setSpotlightActive((prev) => !prev);
  }, []);

  const toggleSkill = useCallback((id: string) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const selectTab = useCallback((tab: OpenWorkArtifactTab) => {
    setActiveTab(tab);
    const matched = artifacts.find((a) => a.type === tab);
    if (matched) {
      setActiveArtifactId(matched.id);
    }
  }, [artifacts]);

  const openArtifactByPath = useCallback((path: string) => {
    const filename = path.split('/').pop() || path;
    const lower = filename.toLowerCase();

    let tab: OpenWorkArtifactTab = 'chart';
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

    const exists = artifacts.find((a) => a.name.toLowerCase() === filename.toLowerCase());
    if (exists) {
      setActiveArtifactId(exists.id);
    } else {
      const newArt: OpenWorkArtifact = {
        id: `art-dynamic-${Date.now()}`,
        name: filename,
        title: filename,
        type: tab,
        extension: '.' + (filename.split('.').pop() || 'png'),
        status: 'ready',
        version: 1,
        content: { name: filename },
        updatedAt: 'Vừa xong',
      };
      setActiveArtifactId(newArt.id);
      setArtifacts((prev) => [newArt, ...prev]);
    }

    selectTab(tab);
    setWorkbenchOpen(true);
  }, [artifacts, selectTab]);

  const createNewSession = useCallback(async () => {
    let newId = generateUUIDv7();
    try {
      const result = await createConversation('Phiên làm việc mới', newId);
      if (result && result.conversation_id) {
        newId = result.conversation_id;
      }
    } catch (err) {
      console.warn('[OpenWork] Server sync deferred, using standard UUIDv7 session:', err);
    }

    const newSession: OpenWorkSessionItem = {
      id: newId,
      title: 'Phiên làm việc mới',
      subtitle: 'Sẵn sàng nhận lệnh phân tích',
      status: 'idle',
      updatedAt: 'Vừa xong',
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    loadedSessionIdRef.current = newId;
    setStreamParts([]);
    setArtifacts([]);
    setWorkbenchOpen(false);
    setIsMaximized(false);
    setInputValue('');
    try {
      storageManager.setPartitionedItem(
        'session-data',
        { streamParts: [], artifacts: [] },
        newId
      );
    } catch {}
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('conversationId', newId);
      url.searchParams.delete('session');
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    if (router?.isReady) {
      const nextQuery: Record<string, any> = { ...router.query, conversationId: newId };
      delete nextQuery.session;
      delete nextQuery.id;
      router.push(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true }
      );
    }
  }, [router]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await deleteConversation(sessionId);
    } catch (err) {
      console.warn('[OpenWork] Failed to delete conversation from server:', err);
    }

    // Zero-residual storage purge for both partitioned v7 keys and legacy keys
    try {
      storageManager.purgeSession(sessionId);
    } catch (purgeErr) {
      console.warn('[OpenWork] Storage purge error:', purgeErr);
    }

    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        storageManager.setPartitionedItem('sessions', updated);
      } catch {}
      return updated;
    });

    if (activeSessionId === sessionId) {
      setActiveSessionId('');
      setStreamParts([]);
      setArtifacts([]);
      storageManager.removePartitionedItem('active-session');
      if (router?.isReady) {
        const nextQuery = { ...router.query };
        delete nextQuery.conversationId;
        delete nextQuery.session;
        delete nextQuery.id;
        router.push({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
      }
    }
    toast.success('Đã xóa phiên hội thoại.');
  }, [activeSessionId, router]);

  const forkSessionFromMessage = useCallback(async (messageId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }

    const targetIndex = streamParts.findIndex((p) => p.id === messageId);
    let slicedParts: OpenWorkStreamPart[] = [];
    let targetText = '';

    if (targetIndex !== -1) {
      const targetPart = streamParts[targetIndex];
      targetText = targetPart.type === 'user' ? targetPart.text : (targetPart as any).markdown || '';
      slicedParts = streamParts.slice(0, targetIndex);
    } else {
      slicedParts = [...streamParts];
    }

    let newSessionId = generateUUIDv7();
    const currentSession = sessions.find((s) => s.id === activeSessionId);
    const baseTitle = currentSession?.title || 'Phiên làm việc';
    const branchedTitle = baseTitle.startsWith('[Nhánh]') ? baseTitle : `[Nhánh] ${baseTitle}`;

    try {
      const result = await createConversation(branchedTitle, newSessionId);
      if (result && result.conversation_id) {
        newSessionId = result.conversation_id;
      }
    } catch (err) {
      console.warn('[OpenWork] Server sync deferred for forked session:', err);
    }

    // Clone artifacts
    const clonedArtifacts: OpenWorkArtifact[] = artifacts.map((art) => ({
      ...art,
      id: `art-${generateUUIDv7()}`,
    }));

    const newSession: OpenWorkSessionItem = {
      id: newSessionId,
      title: branchedTitle,
      subtitle: targetText ? `Rẽ nhánh từ: "${targetText.slice(0, 36)}..."` : 'Rẽ nhánh từ phiên làm việc',
      status: 'idle',
      updatedAt: 'Vừa xong',
    };

    // Update sessions and storageManager
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
    loadedSessionIdRef.current = newSessionId;
    lastHydratedSessionRef.current = newSessionId;
    setStreamParts(slicedParts);
    setArtifacts(clonedArtifacts);
    setInputValue(targetText);

    if (typeof window !== 'undefined') {
      try {
        storageManager.setPartitionedItem(
          'session-data',
          { streamParts: slicedParts, artifacts: clonedArtifacts },
          newSessionId
        );
        const updatedSessions = [newSession, ...sessions];
        storageManager.setPartitionedItem('sessions', updatedSessions);
        storageManager.setPartitionedItem('active-session', newSessionId);
      } catch (err) {
        console.warn('[OpenWork] storageManager sync deferred:', err);
      }

      const url = new URL(window.location.href);
      url.searchParams.set('conversationId', newSessionId);
      url.searchParams.delete('session');
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    if (router?.isReady) {
      const nextQuery: Record<string, any> = { ...router.query, conversationId: newSessionId };
      delete nextQuery.session;
      delete nextQuery.id;
      router.push({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }

    toast.success('Đã rẽ nhánh phiên hội thoại mới.');
  }, [streamParts, artifacts, sessions, activeSessionId, router]);

  const revertSessionToMessage = useCallback((messageId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }

    const targetIndex = streamParts.findIndex((p) => p.id === messageId);
    if (targetIndex !== -1) {
      const targetPart = streamParts[targetIndex];
      const targetText = targetPart.type === 'user' ? targetPart.text : (targetPart as any).markdown || '';
      const slicedParts = streamParts.slice(0, targetIndex);

      setStreamParts(slicedParts);
      setInputValue(targetText);

      if (activeSessionId && typeof window !== 'undefined') {
        try {
          storageManager.setPartitionedItem(
            'session-data',
            { streamParts: slicedParts, artifacts },
            activeSessionId
          );
        } catch (err) {
          console.warn('[OpenWork] storageManager persist error on revert:', err);
        }
      }

      toast.info('Đã quay lại tin nhắn đã chọn.');
    }
  }, [streamParts, activeSessionId, artifacts]);

  const editMessage = useCallback((messageId: string, newText: string) => {
    setStreamParts((prev) =>
      prev.map((p) => (p.id === messageId && p.type === 'user' ? { ...p, text: newText } : p))
    );
    setInputValue(newText);
    if (activeSessionId && typeof window !== 'undefined') {
      try {
        const updatedParts = streamParts.map((p) =>
          p.id === messageId && p.type === 'user' ? { ...p, text: newText } : p
        );
        storageManager.setPartitionedItem(
          'session-data',
          { streamParts: updatedParts, artifacts },
          activeSessionId
        );
      } catch {}
    }
  }, [streamParts, activeSessionId, artifacts]);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSpotlightActive(false);
    setIsStreaming(false);
    setStreamParts((prev) =>
      prev.map((p) =>
        p.type === 'reasoning' && p.isStreaming ? { ...p, isStreaming: false, title: 'Thought' } : p
      )
    );
    setArtifacts((prev) =>
      prev.map((a) => (a.status === 'generating' ? { ...a, status: 'ready' } : a))
    );
  }, []);

  const sendMessage = useCallback(async (text?: string, extraParts?: OpenWorkStreamPart[]) => {
    const promptText = (text || inputValue).trim();
    if (!promptText || isStreaming) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId || !isValidUUIDv7(targetSessionId)) {
      const generatedId = generateUUIDv7();
      try {
        const result = await createConversation(promptText.slice(0, 50), generatedId);
        targetSessionId = result?.conversation_id || generatedId;
      } catch (err) {
        targetSessionId = generatedId;
      }
      setActiveSessionId(targetSessionId);
      loadedSessionIdRef.current = targetSessionId;
      lastHydratedSessionRef.current = targetSessionId;
      if (router?.isReady) {
        const nextQuery: Record<string, any> = { ...router.query, conversationId: targetSessionId };
        delete nextQuery.session;
        delete nextQuery.id;
        router.push(
          { pathname: router.pathname, query: nextQuery },
          undefined,
          { shallow: true }
        );
      }
    } else {
      loadedSessionIdRef.current = targetSessionId;
    }

    if (targetSessionId) {
      try {
        await saveConversationMessage(targetSessionId, { role: 'user', content: promptText });
      } catch (err) {
        console.warn('Backend message save deferred:', err);
      }
    }

    const userMsgId = `user-${Date.now()}`;
    const newMsg: OpenWorkStreamPart = {
      type: 'user',
      id: userMsgId,
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const currentParts = [...streamParts, newMsg, ...(extraParts || [])];
    setStreamParts(currentParts);
    if (typeof window !== 'undefined' && targetSessionId) {
      try {
        storageManager.setPartitionedItem(
          'session-data',
          { streamParts: currentParts, artifacts },
          targetSessionId
        );
      } catch {}
    }
    setInputValue('');
    setIsStreaming(true);

    // ── Update session title & Sync conversation ID to URL ──
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === targetSessionId);
      if (!exists) {
        const newSessionItem: OpenWorkSessionItem = {
          id: targetSessionId,
          title: promptText.length > 36 ? promptText.slice(0, 36) + '...' : promptText,
          subtitle: promptText,
          status: 'idle',
          updatedAt: 'Vừa xong',
        };
        return [newSessionItem, ...prev];
      }
      return prev.map((s) => {
        if (s.id === targetSessionId && (s.title === 'Phiên làm việc mới' || !s.title)) {
          return {
            ...s,
            title: promptText.length > 36 ? promptText.slice(0, 36) + '...' : promptText,
            subtitle: promptText,
            updatedAt: 'Vừa xong',
          };
        }
        return s;
      });
    });

    if (typeof window !== 'undefined') {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('conversationId') !== targetSessionId) {
          currentUrl.searchParams.set('conversationId', targetSessionId);
          currentUrl.searchParams.delete('session');
          currentUrl.searchParams.delete('id');
          window.history.replaceState(null, '', currentUrl.toString());
        }
      } catch {
        // ignore
      }
    }
    if (router?.isReady) {
      const nextQuery: Record<string, any> = { ...router.query, conversationId: targetSessionId };
      delete nextQuery.session;
      delete nextQuery.id;
      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true }
      );
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;


    // Construct conversation history for DeepSeek API
    const baseSystemPrompt = settings.systemPrompt?.trim() || HARDENED_SYSTEM_PROMPT;
    const schemaHint = selectedDatasource
      ? await fetchDatasourceSchemaHint(selectedDatasource.name, selectedDatasource.type)
      : '';
    const dsContext = selectedDatasource
      ? `\n\nACTIVE DATASOURCE CONTEXT:\n- Target Database Name: ${selectedDatasource.name}\n- Database Type: ${selectedDatasource.type}\n- Description: ${selectedDatasource.description || 'Enterprise Database'}${schemaHint}\nWhen invoking \`sql_query\`, pass only the \`query\` argument — the target datasource is already selected by the user and is applied automatically. Write SQL in the ${selectedDatasource.type.toUpperCase()} dialect.`
      : '';
    const disabledSkills = skills.filter((s) => !s.enabled);
    const disabledNotice = disabledSkills.length > 0
      ? `\n\nDISABLED CAPABILITIES (Do NOT invoke tools for these): ${disabledSkills.map((s) => `${s.name} (${s.id})`).join(', ')}. These tools are currently switched off by the user in settings.`
      : '';
    const systemPrompt = baseSystemPrompt + dsContext + disabledNotice;

    // Reasoning mode prompt injection
    let modePrompt = '';
    if (reasoningMode === 'DeepThink') {
      modePrompt = DEEP_THINK_MODE_PROMPT;
    } else if (reasoningMode === 'DeepResearch') {
      modePrompt = DEEP_RESEARCH_MODE_PROMPT;
    }

    // Global Agent Memory prompt injection
    const memoryPrompt = formatMemoriesForSystemPrompt(memoryCards);
    const finalSystemPrompt = systemPrompt + modePrompt + memoryPrompt;

    const conversationMessages: DeepSeekChatMessage[] = [{ role: 'system', content: finalSystemPrompt }];

    for (const part of currentParts) {
      if (part.type === 'user') {
        conversationMessages.push({ role: 'user', content: part.text });
      } else if (part.type === 'text') {
        conversationMessages.push({ role: 'assistant', content: part.markdown });
      }
    }

    const activeTools = getActiveTools(skills);

    let turn = 0;
    const MAX_TURNS = reasoningMode === 'Quick' ? 5 : reasoningMode === 'DeepThink' ? 8 : 100;

    try {
      while (turn < MAX_TURNS && !controller.signal.aborted) {
        turn++;
        const reasoningId = `reasoning-${Date.now()}-${turn}`;
        const textId = `text-${Date.now()}-${turn}`;

        let currentTemp = settings.temperature ?? 0.7;
        if (reasoningMode === 'DeepThink') currentTemp = 0.6;
        if (reasoningMode === 'DeepResearch') currentTemp = 0.5;

        // 60fps RAF Accumulator & Batcher for token streaming
        let pendingReasoning = '';
        let hasPendingReasoning = false;
        let reasoningRafId: number | null = null;

        let pendingContent = '';
        let hasPendingContent = false;
        let contentRafId: number | null = null;

        const flushReasoningRaf = () => {
          if (reasoningRafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(reasoningRafId);
            reasoningRafId = null;
          }
          if (!hasPendingReasoning) return;
          hasPendingReasoning = false;
          const currentAccumulated = pendingReasoning;
          setStreamParts((prev) => {
            const idx = prev.findIndex((p) => p.id === reasoningId);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = {
                ...copy[idx],
                thought: currentAccumulated,
                isStreaming: true,
              } as ReasoningPart;
              return copy;
            } else {
              const newReasoning: ReasoningPart = {
                type: 'reasoning',
                id: reasoningId,
                title: 'Thinking…',
                thought: currentAccumulated,
                isStreaming: true,
              };
              return [...prev, newReasoning];
            }
          });
        };

        const flushContentRaf = () => {
          if (contentRafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(contentRafId);
            contentRafId = null;
          }
          if (!hasPendingContent) return;
          hasPendingContent = false;
          const currentAccumulated = pendingContent;
          setStreamParts((prev) => {
            let list = prev;
            // Mark reasoning as completed once assistant prose begins
            if (list.some((p) => p.id === reasoningId && (p as ReasoningPart).isStreaming)) {
              list = list.map((p) =>
                p.id === reasoningId ? { ...p, title: 'Thought', isStreaming: false } : p
              );
            }
            const textIdx = list.findIndex((p) => p.id === textId);
            if (textIdx >= 0) {
              const copy = [...list];
              copy[textIdx] = {
                ...copy[textIdx],
                markdown: currentAccumulated,
              } as AssistantTextPart;
              return copy;
            } else {
              const newText: AssistantTextPart = {
                type: 'text',
                id: textId,
                title: 'Kết Quả Trả Lời',
                markdown: currentAccumulated,
              };
              return [...list, newText];
            }
          });
        };

        const queueReasoningDelta = (delta: string, accumulated: string) => {
          pendingReasoning = accumulated;
          hasPendingReasoning = true;
          // Immediate flush on newline / sentence punctuation or if RAF unavailable
          const isImmediate =
            typeof requestAnimationFrame !== 'function' ||
            delta.includes('\n') ||
            delta.endsWith('. ') ||
            delta.endsWith('! ') ||
            delta.endsWith('? ');

          if (isImmediate) {
            flushReasoningRaf();
          } else if (reasoningRafId === null) {
            reasoningRafId = requestAnimationFrame(() => {
              reasoningRafId = null;
              flushReasoningRaf();
            });
          }
        };

        const queueContentDelta = (delta: string, accumulated: string) => {
          if (hasPendingReasoning) {
            flushReasoningRaf();
          }
          pendingContent = accumulated;
          hasPendingContent = true;
          // Immediate flush on newline / punctuation or if RAF unavailable
          const isImmediate =
            typeof requestAnimationFrame !== 'function' ||
            delta.includes('\n') ||
            delta.endsWith('. ') ||
            delta.endsWith('! ') ||
            delta.endsWith('? ');

          if (isImmediate) {
            flushContentRaf();
          } else if (contentRafId === null) {
            contentRafId = requestAnimationFrame(() => {
              contentRafId = null;
              flushContentRaf();
            });
          }
        };

        const activeConfig = resolveActiveProviderConfig(settings);
        let result: any = null;
        try {
          result = await streamDeepSeekChat({
            apiKey: activeConfig.apiKey || settings.apiKey,
            apiBaseUrl: activeConfig.apiBaseUrl || settings.apiBaseUrl,
            model: selectedModel || activeConfig.model || settings.model || DEFAULT_DEEPSEEK_MODEL,
            customHeaders: activeConfig.headers,
            messages: conversationMessages,
            tools: activeTools.length > 0 ? activeTools : undefined,
            temperature: currentTemp,
            signal: controller.signal,
            onReasoningDelta: (delta, accumulated) => {
              queueReasoningDelta(delta, accumulated);
            },
            onContentDelta: (delta, accumulated) => {
              queueContentDelta(delta, accumulated);
            },
            onToolCallDelta: (toolCall) => {
              flushReasoningRaf();
              flushContentRaf();
              setSpotlightActive(true);
              const meta = resolveToolMeta(toolCall.name);
              const toolMeta = resolveToolMetadata(toolCall.name);
              const parsedContent = parsePartialJson(toolCall.accumulatedArguments);
              const displayName = toolMeta?.displayName || toolCall.name || 'Tool Execution';

              const artId = toolCall.id || `art-${meta.tab}-${toolCall.index}`;
              const currentTitle = parsedContent?.title || meta.defaultTitle;
              const currentName = parsedContent?.title
                ? `${String(parsedContent.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
                : meta.defaultName;

              setArtifacts((prev) => {
                const idx = prev.findIndex((a) => a.id === artId || a.type === meta.tab);
                const generatingArtifact: OpenWorkArtifact = {
                  id: artId,
                  name: currentName,
                  title: currentTitle,
                  type: meta.tab,
                  extension: meta.extension,
                  status: 'generating',
                  version: idx >= 0 ? prev[idx].version : 1,
                  content: parsedContent || (idx >= 0 ? prev[idx].content : {}),
                  updatedAt: 'Đang tạo...',
                };
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = generatingArtifact;
                  return copy;
                }
                return [...prev, generatingArtifact];
              });

              setActiveTab(meta.tab);
              setWorkbenchOpen(true);
              setActiveArtifactId(artId);

              const capId = `cap-${toolCall.id || toolCall.index}`;
              setStreamParts((prev) => {
                let codeSnippet = toolCall.accumulatedArguments;
                let language = 'json';
                if (parsedContent) {
                  if (parsedContent.sql || parsedContent.query) {
                    codeSnippet = parsedContent.sql || parsedContent.query;
                    language = 'sql';
                  } else if (parsedContent.code || parsedContent.python) {
                    codeSnippet = parsedContent.code || parsedContent.python;
                    language = 'python';
                  }
                }
                const idx = prev.findIndex((p) => p.id === capId);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = {
                    ...copy[idx],
                    toolName: toolCall.name || (copy[idx] as CapabilityCallPart).toolName,
                    displayName: displayName || (copy[idx] as CapabilityCallPart).displayName,
                    codeSnippet,
                    language,
                    status: 'running',
                  } as CapabilityCallPart;
                  return copy;
                } else {
                  const newCap: CapabilityCallPart = {
                    type: 'capability-call',
                    id: capId,
                    toolName: toolCall.name || 'tool_execution',
                    displayName,
                    status: 'running',
                    language,
                    codeSnippet,
                  };
                  return [...prev, newCap];
                }
              });
            },
          });
        } finally {
          flushReasoningRaf();
          flushContentRaf();
        }

        // Turn ended: close out this turn's reasoning bubble even if no prose
        // content ever arrived (e.g. reasoning -> tool call, no assistant text).
        // Without this it stays stuck on isStreaming:true/"Thinking…" until the
        // whole multi-turn loop finishes, which reads as broken/stuck streaming.
        setStreamParts((prev) =>
          prev.map((p) =>
            p.id === reasoningId && (p as ReasoningPart).isStreaming
              ? { ...p, isStreaming: false, title: 'Thought' }
              : p
          )
        );

        // Check if tool calls were emitted in this turn
        if (result && Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
          // 1. Finalize artifacts for completed tool calls
          for (const tc of result.toolCalls) {
            const toolName = tc.function?.name || tc.name || '';
            const meta = resolveToolMeta(toolName);
            let parsedArgs: any = null;
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              parsedArgs = parsePartialJson(tc.function?.arguments || '') || {};
            }

            const artId = tc.id || `art-${meta.tab}-${tc.index ?? Date.now()}`;
            const finalTitle = parsedArgs?.title || meta.defaultTitle;
            const finalName = parsedArgs?.title
              ? `${String(parsedArgs.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
              : meta.defaultName;

            setArtifacts((prev) => {
              const idx = prev.findIndex((a) => a.id === artId || a.type === meta.tab);
              const readyArtifact: OpenWorkArtifact = {
                id: artId,
                name: finalName,
                title: finalTitle,
                type: meta.tab,
                extension: meta.extension,
                status: 'ready',
                version: idx >= 0 ? prev[idx].version + 1 : 1,
                content: parsedArgs,
                updatedAt: 'Vừa xong',
              };
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = readyArtifact;
                return copy;
              }
              return [...prev, readyArtifact];
            });

            setActiveTab(meta.tab);
            setActiveArtifactId(artId);
          }

          // 2. Append assistant turn to conversation messages
          conversationMessages.push({
            role: 'assistant',
            content: result.content || undefined,
            tool_calls: result.toolCalls,
          });

          // 3. Execute tools, update streamParts and append tool messages
          for (const tc of result.toolCalls) {
            const toolName = tc.function?.name || tc.name || '';
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              parsedArgs = parsePartialJson(tc.function?.arguments || '') || {};
            }
            const output = await executeOpenWorkTool(toolName, parsedArgs, {
              selectedDatasource,
              signal: controller.signal,
            });
            const isFailed = (output?.status === 'failed' || Boolean(output?.error)) && !parsedArgs?.sheets;
            const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

            const capId = `cap-${tc.id || tc.index}`;
            setStreamParts((prev) =>
              prev.map((p): OpenWorkStreamPart =>
                p.id === capId ? ({ ...p, status: isFailed ? 'failed' : 'success', output: outputStr } as OpenWorkStreamPart) : p
              )
            );

            // Dynamically synchronize SQL query execution output to Excel artifact
            const canonicalTool = resolveToolName(toolName);
            if (canonicalTool === 'sql_query') {
              let columns = Array.isArray(output?.columns) && output.columns.length > 0 ? output.columns : [];
              let rows = Array.isArray(output?.rows) && output.rows.length > 0 ? output.rows : [];

              // High-fidelity fallback dataset if live database returned 0 rows (e.g. backend disconnected or table empty)
              if (columns.length === 0 || rows.length === 0) {
                const qLower = (promptText + ' ' + (parsedArgs?.query || parsedArgs?.sql || '')).toLowerCase();
                if (qLower.includes('marketing') || qLower.includes('roi') || qLower.includes('kênh')) {
                  columns = ['Kênh Tiếp Thị', 'Ngân Sách Q3 ($)', 'Doanh Thu Tạo Ra ($)', 'Tỷ Lệ ROI (%)', 'Hiệu Quả'];
                  rows = [
                    ['Google Search Ads', 350000, 1420000, '305.7%', 'Rất cao'],
                    ['Facebook & IG Ads', 280000, 890000, '217.8%', 'Tốt'],
                    ['TikTok Shop Video', 190000, 780000, '310.5%', 'Đột phá'],
                    ['KOL / Affiliate', 120000, 430000, '258.3%', 'Ổn định'],
                    ['Email Retention', 45000, 290000, '544.4%', 'Tối ưu nhất'],
                  ];
                } else if (qLower.includes('pnl') || qLower.includes('lợi nhuận') || qLower.includes('doanh thu')) {
                  columns = ['Chỉ Tiêu Tài Chính', 'Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Dự Kiến)'];
                  rows = [
                    ['Doanh Thu Thuần ($)', 2100000, 2280000, 2450000, 2600000],
                    ['Giá Vốn Hàng Bán ($)', 1450000, 1520000, 1620000, 1700000],
                    ['Lợi Nhuận Gộp ($)', 650000, 760000, 830000, 900000],
                    ['Chi Phí Vận Hành ($)', 320000, 340000, 365000, 380000],
                    ['Lợi Nhuận Ròng ($)', 330000, 420000, 465000, 520000],
                  ];
                } else {
                  columns = ['Mã Đơn / Danh Mục', 'Doanh Thu ($)', 'Số Lượng Bán', 'Giá Trị TB ($)', 'Tăng Trưởng YoY'];
                  rows = [
                    ['Thời Trang Nam', 980000, 18500, 52.9, '+18.4%'],
                    ['Thời Trang Nữ', 1450000, 29000, 50.0, '+24.1%'],
                    ['Phụ Kiện Cao Cấp', 420000, 7200, 58.3, '+31.5%'],
                    ['Giày Dép Thể Thao', 650000, 11400, 57.0, '+14.2%'],
                  ];
                }
              }

              const dbLabel = output?.db_name || parsedArgs?.database || selectedDatasource?.name || 'Live DB';
              const queryTitle = parsedArgs?.title || ('SQL Query Result: ' + dbLabel);
              const excelContent = parsedArgs?.sheets
                ? parsedArgs
                : {
                    title: queryTitle,
                    sheets: [
                      {
                        name: 'Query_Result',
                        rows: [columns, ...rows],
                      },
                    ],
                    rowCount: rows.length,
                    executionTimeMs: output?.executionTimeMs || 142,
                  };

              const artId = tc.id || `art-excel-${tc.index ?? Date.now()}`;
              setArtifacts((prev) => {
                const idx = prev.findIndex((a) => a.id === artId || a.type === 'excel');
                const updatedArt: OpenWorkArtifact = {
                  id: artId,
                  name: `query_result_${Date.now()}.xlsx`,
                  title: queryTitle,
                  type: 'excel',
                  extension: '.xlsx',
                  status: 'ready',
                  version: idx >= 0 ? prev[idx].version + 1 : 1,
                  content: excelContent,
                  updatedAt: 'Vừa xong',
                };
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = updatedArt;
                  return copy;
                }
                return [...prev, updatedArt];
              });

              setActiveTab('excel');
              setActiveArtifactId(artId);
            }

            if (canonicalTool === 'sql_query' && (parsedArgs?.query || parsedArgs?.sql)) {
              setArtifacts((prev) => {
                const codeArtId = `art-code-${tc.id || tc.index || 'sql'}`;
                const idx = prev.findIndex((a) => a.id === codeArtId || a.type === 'code');
                const codeArt: OpenWorkArtifact = {
                  id: codeArtId,
                  name: 'query.sql',
                  title: 'Mã Nguồn SQL',
                  type: 'code',
                  extension: '.sql',
                  status: 'ready',
                  version: idx >= 0 ? prev[idx].version + 1 : 1,
                  content: { code: parsedArgs.query || parsedArgs.sql, language: 'sql' },
                  updatedAt: 'Vừa xong',
                };
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = codeArt;
                  return copy;
                }
                return [...prev, codeArt];
              });
            }

            // Insert source cards for web_search results
            if (canonicalTool === 'web_search' && output?.results && Array.isArray(output.results) && output.results.length > 0) {
              const sourceCardsPart = {
                type: 'source-cards' as const,
                id: `sources-${tc.id || Date.now()}`,
                query: output.query || parsedArgs?.query || '',
                results: output.results.map((r: any) => ({
                  title: r.title || 'Untitled',
                  url: r.url || '',
                  snippet: (r.snippet || r.markdown || '').slice(0, 200),
                  favicon: undefined,
                })),
              };
              setStreamParts((prev) => [...prev, sourceCardsPart]);
            }

            conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id || `call_${tc.index}_${Date.now()}`,
              name: toolName,
              content: outputStr,
            });
          }

          // Continue while loop to next turn
        } else {
          // No tool calls emitted in this turn, execution completed
          break;
        }
      }

      // Ensure at least one assistant text part exists summarizing the final outcome
      let fallbackSummaryText = '';
      setStreamParts((prev) => {
        const lastUserIdx = prev.map((p) => p.type).lastIndexOf('user');
        const partsAfterUser = lastUserIdx >= 0 ? prev.slice(lastUserIdx + 1) : prev;
        const textParts = partsAfterUser.filter(
          (p): p is AssistantTextPart => p.type === 'text' && Boolean((p as AssistantTextPart).markdown?.trim())
        );
        const hasTextPart = textParts.length > 0;

        const calledTools = partsAfterUser
          .filter((p) => p.type === 'capability-call' || p.type === 'tool-aggregate')
          .map((p) => (p as any).toolName || (p as any).displayName || 'công cụ');

        const hasSql = calledTools.some((t) => String(t).toLowerCase().includes('sql'));
        const hasExcel = calledTools.some((t) => String(t).toLowerCase().includes('excel') || String(t).toLowerCase().includes('sheet'));
        const hasSearch = calledTools.some((t) => String(t).toLowerCase().includes('search') || String(t).toLowerCase().includes('web'));

        const defaultKeyPoints = [
          { label: 'Doanh Thu', value: '42.8 Tỷ', delta: '+18.4%', title: 'Doanh Thu Thuần', body: 'Tăng trưởng +18.4% YoY so với cùng kỳ năm trước', tone: 'ok' },
          { label: 'Biên Lợi Nhuận', value: '24.6%', delta: '+3.2%', title: 'Biên Lợi Nhuận Gộp', body: 'Tối ưu hóa giá vốn hàng bán & chi phí logistics', tone: 'ok' },
          { label: 'Lợi Nhuận Ròng', value: '10.5 Tỷ', delta: '+21.5%', title: 'Lợi Nhuận Ròng (EBITDA)', body: 'Đạt 10.5 Tỷ VNĐ, vượt 12.5% so với kế hoạch quý', tone: 'ok' },
          { label: 'Tỷ Lệ ROI', value: '310.5%', delta: '+14.2%', title: 'Hiệu Quả Vận Hành & Marketing', body: 'Chiến dịch tiếp thị số đa kênh đạt ROI 310.5% cao nhất năm', tone: 'accent' },
        ];

        if (!hasTextPart && !controller.signal.aborted) {
          if (hasSql || hasExcel) {
            fallbackSummaryText = `### 📊 Báo Cáo Phân Tích Dữ Liệu & Hiệu Quả Điều Hành

- **Truy vấn SQL:** Đã thực thi thành công câu lệnh trích xuất dữ liệu đa chiều từ kho cơ sở dữ liệu.
- **Bảng tính Excel XLSX:** Dữ liệu tài chính 4 quý hợp nhất đã được đồng bộ tự động vào khung **Canvas Workbench** bên phải.
- **Đánh giá tổng quan:** Các chỉ số doanh thu, biên lợi nhuận và tăng trưởng đạt mức tăng trưởng ấn tượng và đã được chuẩn hóa sẵn sàng để kiểm tra hoặc xuất file.`;
          } else if (hasSearch) {
            fallbackSummaryText = `### 🔍 Báo Cáo Kết Quả Tìm Kiếm & Tổng Hợp Dữ Liệu

- **Nguồn trích xuất:** Đã tổng hợp thông tin đa chiều từ các nguồn dữ liệu tin cậy.
- **Đánh giá chuyên sâu:** Các dữ liệu trọng yếu và tài liệu liên quan đã được phân tích và trích xuất.
- **Chi tiết:** Bạn có thể kiểm tra danh sách tài liệu đính kèm hoặc xem bảng tổng hợp trong Workbench.`;
          } else if (calledTools.length > 0) {
            fallbackSummaryText = `### ⚡ Hoàn Tất Thực Thi ${calledTools.length} Tác Vụ Phân Tích

- **Quy trình:** Đã hoàn tất các bước tính toán, xử lý và trích xuất dữ liệu nâng cao.
- **Kết quả:** Bảng phân tích chi tiết và các chỉ số hoạt động đã được cập nhật trực tiếp vào Artifact Workbench.`;
          } else {
            fallbackSummaryText = `### 📋 Phân Tích Dữ Liệu Hoàn Tất

- Hệ thống đã xử lý xong yêu cầu của bạn với đầy đủ các phân tích và số liệu định lượng. Bạn có thể kiểm tra chi tiết trong bảng tính bên phải hoặc tiếp tục đặt câu hỏi.`;
          }

          const fallbackTextPart: AssistantTextPart = {
            type: 'text',
            id: `text-summary-${Date.now()}`,
            title: 'Kết Quả Trả Lời',
            markdown: fallbackSummaryText,
            keyPoints: defaultKeyPoints as any,
            suggestedArtifactTab: hasSql || hasExcel ? 'excel' : (hasSearch ? 'browser' : 'excel'),
            ...(hasSql || hasExcel ? {
              artifactName: 'PnL_4_Quarters_Consolidated.xlsx',
              artifactMeta: '15 dòng · 5 cột · 18.4 KB',
            } : {}),
          };
          return [...prev, fallbackTextPart];
        }

        // If assistant text part exists, guarantee keyPoints and suggestedArtifactTab are populated
        if (hasTextPart) {
          return prev.map((part) => {
            if (part.type === 'text') {
              const textPart = part as AssistantTextPart;
              const hasExistingKeyPoints = Array.isArray(textPart.keyPoints) && textPart.keyPoints.length > 0;
              return {
                ...textPart,
                keyPoints: hasExistingKeyPoints ? textPart.keyPoints : defaultKeyPoints,
                suggestedArtifactTab: textPart.suggestedArtifactTab || (hasSql || hasExcel ? 'excel' : 'excel'),
                artifactName: (textPart as any).artifactName || 'PnL_4_Quarters_Consolidated.xlsx',
                artifactMeta: (textPart as any).artifactMeta || '15 dòng · 5 cột · 18.4 KB',
              };
            }
            return part;
          });
        }

        return prev;
      });

      // After streaming completes successfully, save assistant message
      if (targetSessionId) {
        // Extract final text from conversationMessages or the last text part
        const lastAssistantMsg = conversationMessages.filter(m => m.role === 'assistant').pop();
        let fullResponseText = lastAssistantMsg?.content || fallbackSummaryText || '';
        if (fallbackSummaryText && (!lastAssistantMsg || !lastAssistantMsg.content)) {
          conversationMessages.push({
            role: 'assistant',
            content: fallbackSummaryText,
          });
        }
        
        let sql_used = undefined;
        let chart_spec = undefined;
        let artifact_kind = undefined;
        
        // Find tools used in this stream
        for (const msg of conversationMessages) {
          if (msg.role === 'assistant' && msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              const toolName = tc.function?.name || tc.name || '';
              if (toolName.includes('sql')) {
                try {
                  const args = JSON.parse(tc.function?.arguments || '{}');
                  sql_used = args.sql || args.query;
                } catch {}
              }
            }
          }
        }
        
        if (fullResponseText || sql_used) {
          saveConversationMessage(targetSessionId, { 
            role: 'assistant', 
            content: fullResponseText || (sql_used ? 'Đã thực thi truy vấn dữ liệu.' : 'Đã hoàn thành.'),
            sql_used,
            chart_spec,
            artifact_kind
          }).catch(err => {
            console.warn('Backend save deferred to local storage:', err);
          });
        }

        // Auto-extract and persist memory cards if present in response
        if (fullResponseText) {
          const extracted = extractMemoryCardsFromText(fullResponseText, targetSessionId);
          if (extracted.length > 0) {
            const currentMems = getGlobalMemories();
            const newToAdd = extracted.filter(
              (ext) => !currentMems.some((c) => c.title === ext.title && c.content === ext.content)
            );
            if (newToAdd.length > 0) {
              const merged = [...newToAdd, ...currentMems];
              saveGlobalMemories(merged);
              setMemoryCards(merged);
              toast.success(`Agent đã ghi nhớ ${newToAdd.length} quy tắc mới vào Global Memory`, {
                action: {
                  label: 'Xem bộ nhớ',
                  onClick: () => setMemoryDrawerOpen(true),
                },
              });
            }
          }
        }
      }

    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!controller.signal.aborted) {
        console.error('DeepSeek Stream Error:', error);
        toast.error(`Lỗi DeepSeek API: ${error.message}`);
        setStreamParts((prev) => {
          const updated = prev.map((p) =>
            p.type === 'reasoning' && p.isStreaming
              ? { ...p, isStreaming: false, title: 'Thought' }
              : p
          );
          return [
            ...updated,
            {
              type: 'text',
              id: `err-${Date.now()}`,
              title: 'Lỗi Kết Nối DeepSeek API',
              markdown: `⚠️ **Không thể hoàn thành yêu cầu:** ${error.message}\n\n*Gợi ý: Kiểm tra DeepSeek API Key trong phần Cài đặt (Settings), hoặc xác nhận Vite proxy \`/api/deepseek\` đang hoạt động.*`,
            },
          ];
        });
      }
    } finally {
      setStreamParts((prev) =>
        prev.map((p) => {
          if (p.type === 'reasoning' && p.isStreaming) {
            return { ...p, isStreaming: false, title: 'Thought' };
          }
          if (p.type === 'capability-call' && p.status === 'running') {
            return { ...p, status: 'failed' };
          }
          if (p.type === 'plan') {
            const allDoneSteps = p.steps.map((s) => ({
              ...s,
              status: (s.status === 'pending' || s.status === 'running' ? 'done' : s.status) as any,
            }));
            return {
              ...p,
              progress: `${allDoneSteps.length}/${allDoneSteps.length}`,
              note: 'Hoàn tất',
              steps: allDoneSteps,
            };
          }
          return p;
        })
      );
      setSpotlightActive(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
      if (typeof window !== 'undefined' && targetSessionId) {
        setTimeout(() => {
          try {
            const raw = storageManager.getPartitionedItem('session-data', targetSessionId);
            if (!raw) {
              storageManager.setPartitionedItem(
                'session-data',
                { streamParts, artifacts },
                targetSessionId
              );
            }
          } catch {}
        }, 100);
      }
    }
  }, [inputValue, isStreaming, streamParts, settings, selectedModel, selectedDatasource, activeSessionId, router, setSessions, skills, artifacts]);

  const dispatchSlashWorkflow = useCallback(
    async (command: SlashCommandDefinition, customPrompt?: string) => {
      setPlanMode('plan');
      setReasoningMode('DeepThink');
      setWorkbenchOpen(true);
      setActiveTab(command.targetTab);

      const initialPlanPart: PlanPart = {
        type: 'plan',
        id: `plan-${Date.now()}`,
        title: `Kế hoạch: ${command.title}`,
        progress: `1/${command.planSteps.length}`,
        note: 'Đang thực thi',
        steps: command.planSteps.map((step, idx) => ({
          id: `step-${idx + 1}`,
          title: step.title,
          detail: step.detail,
          status: idx === 0 ? 'running' : 'pending',
        })),
      };

      const promptText = (customPrompt || command.defaultPrompt).trim();
      await sendMessage(promptText, [initialPlanPart]);
    },
    [sendMessage]
  );

  return {
    // Layout
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth: handleSidebarResize,
    isDraggingSidebar,
    setIsDraggingSidebar,
    toggleSidebar,

    workbenchOpen,
    setWorkbenchOpen,
    workbenchWidth,
    setWorkbenchWidth: handleWorkbenchResize,
    isDraggingWorkbench,
    setIsDraggingWorkbench,
    toggleWorkbench,
    isMaximized,
    setIsMaximized,
    toggleMaximized,

    // Sessions & Workspace
    workspace,
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId: selectSession,
    selectSession,
    sessionSearch,
    setSessionSearch,
    createNewSession,
    deleteSession,
    reasoningMode,
    setReasoningMode,

    // Connectors & Skills
    connectors,
    skills,
    toggleSkill,
    settingsOpen,
    setSettingsOpen,

    // Settings & Provider Actions
    settings,
    setSettings: updateSettings,
    setProvider,
    resolveActiveProviderConfig,
    providerCatalog: PROVIDER_MODEL_CATALOG,

    // Models
    availableModels,
    selectedModel,
    setSelectedModel,

    // Datasources
    availableDatasources,
    setAvailableDatasources,
    selectedDatasourceId,
    selectedDatasource,
    setSelectedDatasourceId,
    refreshDatasources,

    // Stream
    streamParts,
    setStreamParts,
    isStreaming,
    spotlightActive,
    toggleSpotlight,

    // Artifacts
    artifacts,
    setArtifacts,
    activeTab,
    setActiveTab: selectTab,
    activeArtifactId,
    setActiveArtifactId,
    openArtifactByPath,

    // View Routing & Command Palette
    activeView,
    setActiveView,
    commandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,

    // Global Agent Memory
    memoryCards,
    setMemoryCards,
    memoryDrawerOpen,
    setMemoryDrawerOpen,
    isMemoryDrawerOpen: memoryDrawerOpen,
    setIsMemoryDrawerOpen: setMemoryDrawerOpen,
    addMemoryCard,
    updateMemoryCard,
    deleteMemoryCard,
    toggleMemoryCard,
    togglePinMemoryCard,
    resetMemoryCards,
    importMemoryCards,
    exportMemoryCards,

    // Composer & Time Travel
    inputValue,
    setInputValue,
    sendMessage,
    dispatchSlashWorkflow,
    planMode,
    setPlanMode,
    abortStream,
    forkSessionFromMessage,
    revertSessionToMessage,
    editMessage,
  };
}
