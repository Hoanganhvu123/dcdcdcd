/**
 * OpenWork Autonomous Tool Definitions & Schema Registry
 * DB-GPT OpenWork Coworker Framework
 * 
 * Provides OpenAI-compatible function calling schemas, TypeScript types,
 * tool name resolvers, workbench metadata, and execution simulation for autonomous tool execution.
 */

import type { DeepSeekToolDefinition } from './deepseek-stream';
import type { OpenWorkArtifactTab, OpenWorkSkillItem, DatasourceItem } from '../types';
export { HARDENED_SYSTEM_PROMPT } from '../prompts/hardened-system-prompt';

// ============================================================================
// 1. TypeScript Interfaces for Tool Arguments & Results
// ============================================================================

// ----------------------------------------------------------------------------
// 1.1 presentation_builder Types (16:9 Slide Decks)
// ----------------------------------------------------------------------------

export type PresentationSlideLayout =
  | 'hero'
  | 'bullets'
  | 'two_col'
  | 'comparison'
  | 'chart'
  | 'stat_grid'
  | 'closing'
  | 'quote'
  | 'big_number'
  | 'timeline'
  | 'image_text'
  | 'section_divider'
  | 'bento_grid'
  | 'split_cover'
  | 'split_content';

export interface PresentationSlide {
  layout: PresentationSlideLayout;
  title: string;
  subtitle?: string;
  takeaway?: string;
  date?: string;
  impact_stat?: string;
  bullets?: string[];
  left_heading?: string;
  left_bullets?: string[];
  right_heading?: string;
  right_bullets?: string[];
  stats?: Array<{
    label: string;
    value: string;
    trend?: string;
  }>;
  insight_text?: string;
  insight?: string;
  quote?: string;
  attribution?: string;
  cta?: string;
  contact_info?: string;
  number?: string;
  label?: string;
  context?: string;
  steps?: Array<{
    label: string;
    description: string;
  }>;
  image_keyword?: string;
  headline?: string;
  body?: string;
  items?: Array<{
    heading: string;
    body: string;
  }>;
}

export interface PresentationBuilderArgs {
  title: string;
  subtitle?: string;
  themeVars?: {
    '--osd-bg'?: string;
    '--osd-text'?: string;
    '--osd-accent'?: string;
    '--osd-muted'?: string;
    '--osd-border'?: string;
    [key: string]: string | undefined;
  };
  slides: PresentationSlide[];
}

// ----------------------------------------------------------------------------
// 1.2 spreadsheet_studio Types (Multi-Tab Excel XLSX Workbooks)
// ----------------------------------------------------------------------------

export interface SpreadsheetSheet {
  name: string;
  rows: (string | number)[][];
  formulas?: Record<string, string>;
}

export interface SpreadsheetStudioArgs {
  title: string;
  description?: string;
  sheets: SpreadsheetSheet[];
}

// ----------------------------------------------------------------------------
// 1.3 doc_writer Types (Formal Executive Word DOCX Reports)
// ----------------------------------------------------------------------------

export interface DocSection {
  heading: string;
  content: string;
  key_points?: string[];
}

export interface DocWriterArgs {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  summary?: string;
  markdown?: string;
  sections?: DocSection[];
}

// ----------------------------------------------------------------------------
// 1.4 sql_query Types (Enterprise Data Warehouse Querying)
// ----------------------------------------------------------------------------

export interface SqlQueryArgs {
  query: string;
  database?: 'postgresql' | 'mysql' | 'clickhouse' | 'sqlite' | string;
  limit?: number;
  description?: string;
}

export interface SqlQueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  executionTimeMs?: number;
  status: 'success' | 'failed';
  error?: string;
}

// ----------------------------------------------------------------------------
// 1.5 python_interpreter Types (Sandboxed Analytical Computation)
// ----------------------------------------------------------------------------

export interface PythonInterpreterArgs {
  code: string;
  packages?: string[];
  description?: string;
}

export interface PythonInterpreterResult {
  stdout: string;
  stderr?: string;
  returnValue?: any;
  charts?: string[];
  executionTimeMs?: number;
  status: 'success' | 'failed';
  error?: string;
}

// ============================================================================
// 2. OpenAI-Compatible Tool Definitions (DeepSeek V4 Function Calling)
// ============================================================================

export const PRESENTATION_BUILDER_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'presentation_builder',
    description:
      'Create a professional 16:9 executive slide deck presentation with rich animated layouts (hero, bullets, two_col, comparison, chart, stat_grid, closing, quote, big_number, timeline, image_text, section_divider, bento_grid, split_cover).',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Main title of the slide deck.',
        },
        subtitle: {
          type: 'string',
          description: 'Optional subtitle or presentation summary.',
        },
        themeVars: {
          type: 'object',
          description:
            'Optional CSS custom properties for slide styling (e.g., --osd-bg, --osd-text, --osd-accent).',
          additionalProperties: {
            type: 'string',
          },
        },
        slides: {
          type: 'array',
          description: 'Ordered array of 16:9 slide items.',
          items: {
            type: 'object',
            properties: {
              layout: {
                type: 'string',
                enum: [
                  'hero',
                  'bullets',
                  'two_col',
                  'comparison',
                  'chart',
                  'stat_grid',
                  'closing',
                  'quote',
                  'big_number',
                  'timeline',
                  'image_text',
                  'section_divider',
                  'bento_grid',
                  'split_cover',
                  'split_content',
                ],
                description: 'Slide layout format.',
              },
              title: {
                type: 'string',
                description: 'Slide heading title.',
              },
              subtitle: {
                type: 'string',
                description: 'Secondary slide caption or subtitle.',
              },
              takeaway: {
                type: 'string',
                description: 'Key takeaway summary highlighted at the bottom of the slide.',
              },
              date: {
                type: 'string',
                description: "Date or quarter string for hero slides (e.g. 'Q3/2026').",
              },
              impact_stat: {
                type: 'string',
                description: "Large highlighted impact statistic (e.g. '+24.8% YoY').",
              },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points list for standard bullets layout.',
              },
              left_heading: {
                type: 'string',
                description: 'Heading for left column (in two_col or comparison layouts).',
              },
              left_bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points for left column.',
              },
              right_heading: {
                type: 'string',
                description: 'Heading for right column.',
              },
              right_bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points for right column.',
              },
              stats: {
                type: 'array',
                description: 'Metric cards for stat_grid layout.',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                    trend: { type: 'string' },
                  },
                  required: ['label', 'value'],
                },
              },
              insight_text: {
                type: 'string',
                description: 'Analytical commentary for chart slides.',
              },
              quote: {
                type: 'string',
                description: 'Quote text for quote slides.',
              },
              attribution: {
                type: 'string',
                description: 'Author attribution for quote slides.',
              },
              cta: {
                type: 'string',
                description: 'Call-to-action text for closing slide.',
              },
              contact_info: {
                type: 'string',
                description: 'Contact or next-steps info on closing slide.',
              },
              number: {
                type: 'string',
                description: "Giant figure for big_number slide (e.g. '99.8%').",
              },
              label: {
                type: 'string',
                description: 'Label accompanying big_number figure.',
              },
              context: {
                type: 'string',
                description: 'Context tag for big_number slide.',
              },
              steps: {
                type: 'array',
                description: 'Milestone roadmap steps for timeline slide.',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['label', 'description'],
                },
              },
              image_keyword: {
                type: 'string',
                description: 'Visual keyword badge for image_text or split_cover slides.',
              },
              headline: {
                type: 'string',
                description: 'Prominent headline text for split_cover slide.',
              },
              body: {
                type: 'string',
                description: 'Descriptive paragraph body.',
              },
              items: {
                type: 'array',
                description: 'Bento grid cards for bento_grid layout.',
                items: {
                  type: 'object',
                  properties: {
                    heading: { type: 'string' },
                    body: { type: 'string' },
                  },
                  required: ['heading', 'body'],
                },
              },
            },
            required: ['layout', 'title'],
          },
        },
      },
      required: ['title', 'slides'],
    },
  },
};

export const SPREADSHEET_STUDIO_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'spreadsheet_studio',
    description:
      'Generate a multi-tab Excel (XLSX) financial model or data table with headers, formatted rows, and dynamic spreadsheet formulas.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: "Workbook file title (e.g. 'PnL_4_Quarters_Consolidated.xlsx').",
        },
        description: {
          type: 'string',
          description: 'Brief description of the spreadsheet contents.',
        },
        sheets: {
          type: 'array',
          description: 'Array of spreadsheet tabs/sheets.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: "Sheet tab name (e.g. 'PnL_Consolidated', 'Revenue_Breakdown').",
              },
              rows: {
                type: 'array',
                description:
                  '2D grid of rows. Index 0 is the column header row, and indices 1+ are data rows.',
                items: {
                  type: 'array',
                  items: {
                    type: ['string', 'number'],
                  },
                },
              },
              formulas: {
                type: 'object',
                description:
                  "Optional mapping of cell coordinates (e.g. 'D5', 'E10') to formula strings (e.g. '=SUM(D2:D4)', '=AVERAGE(B2:B8)').",
                additionalProperties: {
                  type: 'string',
                },
              },
            },
            required: ['name', 'rows'],
          },
        },
      },
      required: ['title', 'sheets'],
    },
  },
};

export const DOC_WRITER_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'doc_writer',
    description:
      'Generate formal multi-section executive reports and Word (DOCX) documents with formatted headings, tables, analytical summaries, and key takeaways.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: "Report title (e.g. 'Báo Cáo Tóm Tắt Điều Hành Q3/2026').",
        },
        subtitle: {
          type: 'string',
          description: 'Executive summary subtitle or document classification.',
        },
        author: {
          type: 'string',
          description: "Author or analyzing team name (default: 'DB-GPT AI Analyst').",
        },
        date: {
          type: 'string',
          description: 'Document publication date.',
        },
        summary: {
          type: 'string',
          description: 'Brief executive abstract.',
        },
        markdown: {
          type: 'string',
          description:
            'Complete report content formatted in Markdown (headings, tables, callouts, lists).',
        },
        sections: {
          type: 'array',
          description: 'Structured sections of the document.',
          items: {
            type: 'object',
            properties: {
              heading: {
                type: 'string',
                description: 'Section header.',
              },
              content: {
                type: 'string',
                description: 'Markdown body of the section.',
              },
              key_points: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key takeaways for this section.',
              },
            },
            required: ['heading', 'content'],
          },
        },
      },
      required: ['title'],
    },
  },
};

export const SQL_QUERY_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'sql_query',
    description:
      'Execute analytical SQL queries against PostgreSQL, MySQL, ClickHouse, or SQLite enterprise data warehouse to extract and aggregate financial, operational, or customer records.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "The exact SQL query string to execute (e.g. 'SELECT quarter, SUM(net_revenue) AS revenue FROM q3_financial_records GROUP BY quarter;').",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of rows to return (default: 100).',
        },
        description: {
          type: 'string',
          description: 'Brief explanation of what data is being queried.',
        },
      },
      required: ['query'],
    },
  },
};

export const PYTHON_INTERPRETER_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'python_interpreter',
    description:
      'Run Python scripts in an isolated sandbox environment for advanced statistical modeling, data transformations, machine learning, and visualization chart generation.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Executable Python code snippet (e.g. using pandas, numpy, matplotlib).',
        },
        packages: {
          type: 'array',
          items: { type: 'string' },
          description:
            "List of external packages required (e.g. ['pandas', 'numpy', 'scipy', 'matplotlib']).",
        },
        description: {
          type: 'string',
          description: 'Purpose or summary of the computational task.',
        },
      },
      required: ['code'],
    },
  },
};

const WEB_SEARCH_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the internet for up-to-date information, news, research data, market trends, and reference materials. Returns top results with titles, URLs, and content snippets. Use this tool when you need external data not available in the connected databases.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query in natural language. Be specific for better results.',
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (1-10). Default: 5.',
        },
        lang: {
          type: 'string',
          description: 'Language code for search results. Default: "vi" for Vietnamese.',
        },
      },
      required: ['query'],
    },
  },
};

const WEB_SCRAPE_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'web_scrape',
    description: 'Read and extract the full content of a specific webpage URL. Returns clean markdown text suitable for analysis. Use after web_search to deep-read the most relevant pages.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL of the webpage to scrape (must start with http:// or https://).',
        },
      },
      required: ['url'],
    },
  },
};

/**
 * Full list of OpenAI-compatible OpenWork tools available for model invocation
 */
export const OPENWORK_TOOL_DEFINITIONS: DeepSeekToolDefinition[] = [
  PRESENTATION_BUILDER_TOOL,
  SPREADSHEET_STUDIO_TOOL,
  DOC_WRITER_TOOL,
  SQL_QUERY_TOOL,
  PYTHON_INTERPRETER_TOOL,
  WEB_SEARCH_TOOL,
  WEB_SCRAPE_TOOL,
];

/**
 * Mapping between OpenWork Skill IDs and their corresponding tool definitions.
 * When a skill is disabled by the user, its mapped tools are filtered out of the API payload.
 */
export const SKILL_TOOL_MAP: Record<string, string[]> = {
  'sql-agent': ['sql_query'],
  'chart-vis': ['python_interpreter'],
  'doc-writer': ['doc_writer'],
  'spreadsheet-studio': ['spreadsheet_studio'],
  'presentation-builder': ['presentation_builder'],
  'autonomous-mcp': ['python_interpreter'],
  'web-search': ['web_search', 'web_scrape'],
};

/**
 * Dynamically filters OPENWORK_TOOL_DEFINITIONS based on enabled skills.
 */
export function getActiveTools(skills: OpenWorkSkillItem[]): DeepSeekToolDefinition[] {
  if (!Array.isArray(skills) || skills.length === 0) {
    return OPENWORK_TOOL_DEFINITIONS;
  }
  const enabledSkills = skills.filter((s) => s.enabled);
  const enabledToolNames = new Set<string>();
  enabledSkills.forEach((s) => {
    const toolNames = SKILL_TOOL_MAP[s.id] || [];
    toolNames.forEach((name) => enabledToolNames.add(name));
  });
  return OPENWORK_TOOL_DEFINITIONS.filter((t) => enabledToolNames.has(t.function.name));
}

// ============================================================================
// 3. Helper & Normalization Functions
// ============================================================================

/**
 * Normalizes tool aliases (legacy test names or prefixed names) to canonical tool names
 */
export function resolveToolName(rawName?: string): string {
  const lower = (rawName || '').toLowerCase();

  if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
    return 'sql_query';
  }
  if (
    lower.includes('spreadsheet') ||
    lower.includes('excel') ||
    lower.includes('sheet') ||
    lower.includes('pnl')
  ) {
    return 'spreadsheet_studio';
  }
  if (
    lower.includes('presentation') ||
    lower.includes('slide') ||
    lower.includes('deck') ||
    lower.includes('pptx')
  ) {
    return 'presentation_builder';
  }
  if (
    lower.includes('doc') ||
    lower.includes('word') ||
    lower.includes('report') ||
    lower.includes('summary')
  ) {
    return 'doc_writer';
  }
  if (
    lower.includes('python') ||
    lower.includes('sandbox') ||
    lower.includes('code') ||
    lower.includes('script')
  ) {
    return 'python_interpreter';
  }
  if (lower.includes('search') || lower.includes('web_search') || lower.includes('google')) {
    return 'web_search';
  }
  if (lower.includes('scrape') || lower.includes('web_scrape') || lower.includes('crawl') || lower.includes('read_url')) {
    return 'web_scrape';
  }

  return rawName || 'unknown_tool';
}

/**
 * Retrieves the tool definition matching a given name or alias
 */
export function getToolDefinitionByName(name: string): DeepSeekToolDefinition | undefined {
  const canonical = resolveToolName(name);
  return OPENWORK_TOOL_DEFINITIONS.find((t) => t.function.name === canonical);
}

export interface ResolvedToolMetadata {
  canonicalName: string;
  displayName: string;
  language: 'sql' | 'json' | 'markdown' | 'python' | 'bash';
  artifactTab: OpenWorkArtifactTab;
  extension: string;
  defaultName: string;
  defaultTitle: string;
  category: string;
}

/**
 * Resolves UI presentation metadata for any tool name or capability call
 */
export function resolveToolMetadata(
  toolName?: string,
  customDisplayName?: string
): ResolvedToolMetadata {
  const canonical = resolveToolName(toolName);

  switch (canonical) {
    case 'sql_query':
      return {
        canonicalName: 'sql_query',
        displayName: customDisplayName || 'SQL Data Analyst (sql_query)',
        language: 'sql',
        artifactTab: 'excel',
        extension: '.xlsx',
        defaultName: 'query_result.xlsx',
        defaultTitle: 'Dữ Liệu Truy Vấn SQL',
        category: 'Database Query',
      };

    case 'spreadsheet_studio':
      return {
        canonicalName: 'spreadsheet_studio',
        displayName: customDisplayName || 'Spreadsheet Studio (spreadsheet_studio)',
        language: 'json',
        artifactTab: 'excel',
        extension: '.xlsx',
        defaultName: 'spreadsheet.xlsx',
        defaultTitle: 'Bảng Tính Excel',
        category: 'Financial Modeling',
      };

    case 'presentation_builder':
      return {
        canonicalName: 'presentation_builder',
        displayName: customDisplayName || 'Presentation Builder (presentation_builder)',
        language: 'json',
        artifactTab: 'slide',
        extension: '.pptx',
        defaultName: 'presentation.pptx',
        defaultTitle: 'Bài Thuyết Trình Slide (16:9)',
        category: '16:9 Presentation',
      };

    case 'doc_writer':
      return {
        canonicalName: 'doc_writer',
        displayName: customDisplayName || 'Executive Writer (doc_writer)',
        language: 'markdown',
        artifactTab: 'docx',
        extension: '.docx',
        defaultName: 'document.docx',
        defaultTitle: 'Tài Liệu Báo Cáo DOCX',
        category: 'A4 Document',
      };

    case 'python_interpreter':
      return {
        canonicalName: 'python_interpreter',
        displayName: customDisplayName || 'Python Sandbox (python_interpreter)',
        language: 'python',
        artifactTab: 'code',
        extension: '.py',
        defaultName: 'script.py',
        defaultTitle: 'Mã Nguồn Python',
        category: 'Code Execution',
      };

    default:
      return {
        canonicalName: toolName || 'unknown_tool',
        displayName: customDisplayName || toolName || 'Autonomous Capability Call',
        language: 'bash',
        artifactTab: 'code',
        extension: '.txt',
        defaultName: 'capability.txt',
        defaultTitle: 'Thực Thi Năng Lực',
        category: 'Capability Bridge',
      };
  }
}

/**
 * Result for the tools that have no server side.
 *
 * presentation_builder / spreadsheet_studio / doc_writer are rendered by the
 * workbench from the arguments the model already sent, so the artifact IS the
 * result and an acknowledgement is the whole truth. Anything that would need a
 * real runtime says so instead of inventing output: a fabricated stdout gets
 * quoted back by the model as if it had run.
 */
export function acknowledgeToolCall(toolName: string, args: any): any {
  const canonical = resolveToolName(toolName);

  if (canonical === 'presentation_builder') {
    return {
      status: 'success',
      message: `Slide deck "${args?.title || 'Presentation'}" rendered with ${args?.slides?.length || 1} slides.`,
    };
  }

  if (canonical === 'spreadsheet_studio') {
    return {
      status: 'success',
      message: `Spreadsheet "${args?.title || 'Workbook'}" created with ${args?.sheets?.length || 1} sheets.`,
    };
  }

  if (canonical === 'doc_writer') {
    return {
      status: 'success',
      message: `Document "${args?.title || 'Report'}" compiled successfully.`,
    };
  }

  // No runtime behind this one. Say that, so the model reports the code it
  // wrote rather than results it never got.
  return {
    status: 'not_executed',
    message: `Tool ${toolName} has no runtime in this deployment; nothing was executed. `
      + 'The arguments are kept as an artifact for the user to run.',
  };
}

/**
 * Executes a live SQL query against DB-GPT backend /api/v1/editor/sql/run with smart fallback
 */
export async function executeLiveSqlQuery(
  query: string,
  dbName?: string,
  signal?: AbortSignal
): Promise<SqlQueryResult> {
  const targetDb = dbName || '';
  const startTime = Date.now();

  if (!targetDb) {
    return {
      status: 'failed',
      error: 'Chưa chọn datasource. Hãy chọn một kết nối dữ liệu trước khi chạy truy vấn.',
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
    };
  }

  try {
    const response = await fetch('/api/v1/editor/sql/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        db_name: targetDb,
        sql: query,
      }),
      signal,
    });

    const elapsed = Date.now() - startTime;
    const resJson = await response.json().catch(() => null);

    if (!response.ok || (resJson && resJson.success === false)) {
      return {
        status: 'failed',
        error: resJson?.err_msg || `SQL request failed (HTTP ${response.status}) on "${targetDb}".`,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: elapsed,
      };
    }

    if (resJson && resJson.success && resJson.data) {
      const { colunms = [], values = [], run_cost } = resJson.data;
      const executionTimeMs = typeof run_cost === 'number' ? Math.round(run_cost * 1000) : elapsed;
      return {
        status: 'success',
        columns: Array.isArray(colunms) ? colunms : [],
        rows: Array.isArray(values) ? values : [],
        rowCount: Array.isArray(values) ? values.length : 0,
        executionTimeMs: executionTimeMs || elapsed,
      };
    }

    return {
      status: 'failed',
      error: `Backend returned no result set for "${targetDb}".`,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return {
      status: 'failed',
      error: `Không kết nối được backend DB-GPT: ${err?.message || 'network error'}`,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Retrieves the Firecrawl API key from persisted settings
 */
function getFirecrawlApiKey(): string {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('openwork:settings:v1') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.firecrawlApiKey) return parsed.firecrawlApiKey;
    }
  } catch {}
  return (typeof process !== 'undefined' && (process?.env?.FIRECRAWL_API_KEY || process?.env?.NEXT_PUBLIC_FIRECRAWL_API_KEY)) || '';
}

/**
 * Executes a web search via Firecrawl Search API
 */
export async function executeWebSearch(
  query: string,
  numResults: number = 5,
  lang: string = 'vi',
  signal?: AbortSignal
): Promise<{ results: Array<{ title: string; url: string; snippet: string; markdown?: string }>; query: string; total: number }> {
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) {
    console.warn('[web_search] Firecrawl API key is not configured. Web search skipped.');
    return { results: [], query, total: 0 };
  }
  try {
    const resp = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: Math.min(numResults, 10),
        lang,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
      signal,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { results: [], query, total: 0 };
    }
    const data = await resp.json();
    const results = (data.data || []).map((item: any) => ({
      title: item.metadata?.title || item.title || 'Untitled',
      url: item.metadata?.sourceURL || item.url || '',
      snippet: (item.markdown || '').slice(0, 300),
      markdown: item.markdown || '',
    }));
    return { results, query, total: results.length };
  } catch (err: any) {
    console.error('[web_search] Error:', err?.message);
    return { results: [], query, total: 0 };
  }
}

/**
 * Scrapes a single URL via Firecrawl Scrape API and returns clean markdown
 */
export async function executeWebScrape(
  url: string,
  signal?: AbortSignal
): Promise<{ title: string; url: string; markdown: string; wordCount: number }> {
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) {
    console.warn('[web_scrape] Firecrawl API key is not configured. Web scrape skipped.');
    return { title: 'Web Scrape Unavailable', url, markdown: 'Firecrawl API key is not configured in Settings.', wordCount: 0 };
  }
  try {
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
      signal,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { title: 'Error', url, markdown: `Failed to scrape: ${errText}`, wordCount: 0 };
    }
    const data = await resp.json();
    const markdown = data.data?.markdown || '';
    return {
      title: data.data?.metadata?.title || 'Untitled',
      url: data.data?.metadata?.sourceURL || url,
      markdown,
      wordCount: markdown.split(/\s+/).length,
    };
  } catch (err: any) {
    console.error('[web_scrape] Error:', err?.message);
    return { title: 'Error', url, markdown: `Scrape failed: ${err?.message}`, wordCount: 0 };
  }
}

/**
 * Asynchronously executes an OpenWork tool (live SQL query for sql_query, or structured processor for other tools)
 */
export async function executeOpenWorkTool(
  toolName: string,
  args: any,
  options?: {
    selectedDatasource?: DatasourceItem | null;
    signal?: AbortSignal;
  }
): Promise<any> {
  const canonical = resolveToolName(toolName);

  if (canonical === 'sql_query') {
    // The datasource is chosen by the user in the UI, never by the model: the
    // model only ever sees connector *types* and would send "sqlite" as db_name.
    const targetDb =
      options?.selectedDatasource?.name ||
      args?.db_name ||
      args?.database ||
      '';
    const query = args?.query || args?.sql || '';
    return await executeLiveSqlQuery(query, targetDb, options?.signal);
  }

  if (canonical === 'web_search') {
    const query = args?.query || '';
    const numResults = args?.num_results || 5;
    const lang = args?.lang || 'vi';
    return await executeWebSearch(query, numResults, lang, options?.signal);
  }

  if (canonical === 'web_scrape') {
    const url = args?.url || '';
    return await executeWebScrape(url, options?.signal);
  }

  // Fallback to standard handler for other tools
  return acknowledgeToolCall(toolName, args);
}

export function executeMockToolCall(toolName: string, args?: any): any {
  const canonical = resolveToolName(toolName);
  if (canonical === 'sql_query') {
    return {
      status: 'success',
      executionTimeMs: 142,
      rowCount: 4,
      columns: ['quarter', 'net_revenue', 'cogs', 'gross_profit'],
      rows: [
        ['Q1/2026', 2100000, 1450000, 650000],
        ['Q2/2026', 2280000, 1520000, 760000],
        ['Q3/2026', 2450000, 1620000, 830000],
        ['Q4/2026 (Est)', 2600000, 1700000, 900000],
      ],
    };
  }
  if (canonical === 'python_interpreter') {
    return {
      status: 'success',
      executionTimeMs: 235,
      stdout: 'ETL Pipeline executed successfully.\nProcessed 4 quarters of PnL records.\nCalculated YoY growth: +24.8%',
      returnValue: { yoy_growth: 0.248, total_revenue: 9430000 },
    };
  }
  if (canonical === 'presentation_builder') {
    return {
      status: 'success',
      message: `Slide deck "${args?.title || 'Presentation'}" rendered with ${args?.slides?.length || 1} slides.`,
    };
  }
  if (canonical === 'doc_writer') {
    return {
      status: 'success',
      message: `Word document "${args?.title || 'Report'}" generated successfully.`,
    };
  }
  if (canonical === 'spreadsheet_studio') {
    return {
      status: 'success',
      message: `Excel spreadsheet "${args?.title || 'Model'}" generated successfully.`,
    };
  }
  return { status: 'success', message: `Executed tool ${canonical}` };
}

const schemaHintCache = new Map<string, string>();

/**
 * Reads the real table/column tree of a datasource from the DB-GPT backend so the
 * model plans SQL against columns that actually exist instead of a hardcoded list.
 */
export async function fetchDatasourceSchemaHint(dbName: string, dbType: string): Promise<string> {
  if (!dbName) return '';
  const cacheKey = `${dbName}:${dbType}`;
  const cached = schemaHintCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const params = new URLSearchParams({
      db_name: dbName,
      db_type: dbType || 'sqlite',
      page_index: '1',
      page_size: '100',
    });
    const res = await fetch(`/api/v1/editor/db/tables?${params.toString()}`);
    if (!res.ok) return '';
    const json = await res.json();
    const tables = json?.data?.children;
    if (!Array.isArray(tables) || tables.length === 0) return '';

    const hint =
      '\n- Real Tables (live from backend):\n' +
      tables
        .map((t: any) => {
          const cols = Array.isArray(t.children)
            ? t.children.map((c: any) => `${c.title} ${c.type}`).join(', ')
            : '';
          return `  * ${t.title}(${cols})`;
        })
        .join('\n');
    schemaHintCache.set(cacheKey, hint);
    return hint;
  } catch {
    return '';
  }
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

