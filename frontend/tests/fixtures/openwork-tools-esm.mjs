/**
 * ESM OpenWork Tools & Datasource Fixture for Deterministic Node Test Suites
 */

export const DEFAULT_DATASOURCES = [
  {
    id: 'sqlite_ecommerce',
    name: 'SQLite (eCommerce DB)',
    type: 'sqlite',
    tablesCount: 6,
    status: 'connected',
    description: 'Đơn hàng, khách hàng & doanh thu bán lẻ',
    isDefault: true,
  },
  {
    id: 'postgres_analytics',
    name: 'PostgreSQL (Sales Analytics)',
    type: 'postgres',
    tablesCount: 14,
    status: 'connected',
    description: 'Kho dữ liệu kinh doanh đa kênh',
  },
  {
    id: 'clickhouse_telemetry',
    name: 'ClickHouse (User Logs)',
    type: 'clickhouse',
    tablesCount: 8,
    status: 'connected',
    description: 'Nhật ký hành vi & truy vết phiên',
  },
  {
    id: 'financial_q3_xlsx',
    name: 'Financial_Reports_Q3.xlsx',
    type: 'excel',
    tablesCount: 4,
    status: 'connected',
    description: 'Bảng tính PnL & dòng tiền 2026',
  },
];

export function mapDbSchemaToDatasourceItem(db) {
  const typeMap = {
    postgresql: 'postgres',
    postgres: 'postgres',
    mysql: 'mysql',
    sqlite: 'sqlite',
    clickhouse: 'clickhouse',
    duckdb: 'duckdb',
    excel: 'excel',
    oracle: 'oracle',
  };

  const rawType = String(db?.db_type || db?.type || 'sqlite').toLowerCase();
  const normalizedType = typeMap[rawType] || rawType;

  return {
    id: String(db?.id || db?.db_name || db?.name || 'db_' + Math.random().toString(36).slice(2, 7)),
    name: db?.name || db?.db_name || db?.label || 'Enterprise Database',
    type: normalizedType,
    tablesCount: typeof db?.tables_count === 'number' ? db.tables_count : undefined,
    status: 'connected',
    description: db?.comment || db?.description || `${normalizedType.toUpperCase()} database connection`,
    host: db?.db_host,
    port: db?.db_port,
  };
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

export function resolveToolName(rawName) {
  const lower = (rawName || '').toLowerCase();
  if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) return 'sql_query';
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) return 'spreadsheet_studio';
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) return 'presentation_builder';
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) return 'doc_writer';
  if (lower.includes('python') || lower.includes('sandbox') || lower.includes('code') || lower.includes('script')) return 'python_interpreter';
  return rawName || 'unknown_tool';
}

export function resolveToolMeta(toolName) {
  const lower = (toolName || '').toLowerCase();
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) {
    return { tab: 'slide', extension: '.pptx', defaultName: 'presentation.pptx', defaultTitle: 'Bài Thuyết Trình Slide (16:9)' };
  }
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) {
    return { tab: 'excel', extension: '.xlsx', defaultName: 'spreadsheet.xlsx', defaultTitle: 'Bảng Tính Excel' };
  }
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) {
    return { tab: 'docx', extension: '.docx', defaultName: 'document.docx', defaultTitle: 'Tài Liệu Báo Cáo DOCX' };
  }
  return { tab: 'code', extension: '.py', defaultName: 'pipeline.py', defaultTitle: 'Mã Nguồn Thực Thi' };
}

export function resolveToolMetadata(toolName, customDisplayName) {
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

export function executeMockToolCall(toolName, args) {
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

  return {
    status: 'success',
    message: `Tool ${toolName} executed successfully.`,
  };
}

export const HARDENED_SYSTEM_PROMPT = `You are OpenWork Coworker, an autonomous AI analyst and data coworker within the DB-GPT framework. You assist users with deep reasoning, data extraction, financial analysis, SQL queries, code execution, and multi-format document/artifact creation (Excel XLSX, Slide PPTX, Word DOCX).`;

export const OPENWORK_TOOL_DEFINITIONS = [
  { function: { name: 'presentation_builder' } },
  { function: { name: 'spreadsheet_studio' } },
  { function: { name: 'doc_writer' } },
  { function: { name: 'sql_query' } },
  { function: { name: 'python_interpreter' } },
];
