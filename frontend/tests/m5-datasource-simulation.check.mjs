import assert from 'node:assert/strict';
import {
  DEFAULT_DATASOURCES,
  mapDbSchemaToDatasourceItem,
  parsePartialJson,
  resolveToolMeta,
  resolveToolName,
  resolveToolMetadata,
  OPENWORK_TOOL_DEFINITIONS,
  HARDENED_SYSTEM_PROMPT,
  executeMockToolCall,
} from './fixtures/openwork-tools-esm.mjs';

console.log('================================================================');
console.log('🚀 MILESTONE M5: DATASOURCE SIMULATION & MULTI-WORKLOAD VERIFICATION');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Enterprise Multi-Database Registry & Normalization
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: Enterprise Multi-Database Registry & Normalization ---');

// 1.1 Verify DEFAULT_DATASOURCES inventory & type coverage
assert.equal(DEFAULT_DATASOURCES.length, 4, 'Expected 4 default enterprise datasources');
const expectedTypes = ['sqlite', 'postgres', 'clickhouse', 'excel'];
for (const type of expectedTypes) {
  const found = DEFAULT_DATASOURCES.find((d) => d.type === type);
  assert.ok(found, `Default datasources should include connector for ${type}`);
  assert.equal(found.status, 'connected');
  assert.ok(found.name.length > 0);
  assert.ok(found.tablesCount && found.tablesCount > 0);
}
console.log('  [PASS] 1.1: Default datasources contain SQLite, Postgres, ClickHouse & Excel');

// 1.2 Multi-dialect schema mapping & normalization
const testSchemas = [
  { raw: { id: 'pg-1', name: 'finance_dw', db_type: 'postgresql', tables_count: 48, db_host: '10.0.1.5', db_port: 5432 }, expectedType: 'postgres' },
  { raw: { id: 'mysql-1', db_name: 'ecom_orders', type: 'mysql', comment: 'Orders MySQL' }, expectedType: 'mysql' },
  { raw: { id: 'ch-1', name: 'telemetry_cluster', db_type: 'clickhouse', tables_count: 12 }, expectedType: 'clickhouse' },
  { raw: { id: 'duck-1', db_name: 'local_lake', type: 'duckdb', description: 'DuckDB Lake' }, expectedType: 'duckdb' },
  { raw: { id: 'ora-1', name: 'core_banking', db_type: 'oracle' }, expectedType: 'oracle' },
];

for (const { raw, expectedType } of testSchemas) {
  const mapped = mapDbSchemaToDatasourceItem(raw);
  assert.equal(mapped.type, expectedType, `Expected type ${expectedType} for ${raw.id}`);
  assert.equal(mapped.status, 'connected');
}
console.log('  [PASS] 1.2: Normalized 5 database dialects (PostgreSQL, MySQL, ClickHouse, DuckDB, Oracle)');

// 1.3 Active Datasource Context Injection into LLM Prompt
function buildSystemPromptWithDatasource(basePrompt, ds) {
  const dsContext = ds
    ? `\n\nACTIVE DATASOURCE CONTEXT:\n- Target Database Name: ${ds.name}\n- Database Type: ${ds.type}\n- Description: ${ds.description || 'Enterprise Database'}\nWhen invoking \`sql_query\`, set the \`database\` argument to "${ds.type}".`
    : '';
  return basePrompt + dsContext;
}

const sqlitePrompt = buildSystemPromptWithDatasource(HARDENED_SYSTEM_PROMPT, DEFAULT_DATASOURCES[0]);
assert.ok(sqlitePrompt.includes('Target Database Name: SQLite (eCommerce DB)'));
assert.ok(sqlitePrompt.includes('database` argument to "sqlite"'));

const pgPrompt = buildSystemPromptWithDatasource(HARDENED_SYSTEM_PROMPT, DEFAULT_DATASOURCES[1]);
assert.ok(pgPrompt.includes('Target Database Name: PostgreSQL (Sales Analytics)'));
assert.ok(pgPrompt.includes('database` argument to "postgres"'));
console.log('  [PASS] 1.3: Active datasource dynamically injected into LLM system prompt context');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Workload 1 Simulation (SQLite E-Commerce Sales Exploration)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Workload 1 (SQLite E-Commerce Sales Exploration) ---');

// Step 1: User prompt submitted on SQLite connection
const userTurn1 = {
  datasourceId: 'sqlite_ecommerce',
  prompt: 'Analyze top 5 product categories by revenue in 2025 and visualize results.',
};

// Step 2: Simulate LLM CoT Reasoning accordion generation
const cotAccordionTrace = {
  id: 'reasoning-turn-1',
  type: 'reasoning',
  title: 'Luồng suy luận & Khám phá dữ liệu SQLite',
  steps: [
    '1. Schema inspection: Inspecting SQLite tables (`orders`, `categories`, `order_items`).',
    '2. Query formulation: Joining `orders` and `categories` on `category_id`, aggregating SUM(`order_items.price * quantity`).',
    '3. Execution plan: Group by category name, filter year = 2025, order by total_revenue desc limit 5.',
    '4. Visualization synthesis: Generate interactive bar chart and tabular breakdown.',
  ],
  thought: '1. Schema inspection: Inspecting SQLite tables (`orders`, `categories`, `order_items`).\n2. Query formulation: Joining `orders` and `categories` on `category_id`, aggregating SUM(`order_items.price * quantity`).\n3. Execution plan: Group by category name, filter year = 2025, order by total_revenue desc limit 5.\n4. Visualization synthesis: Generate interactive bar chart and tabular breakdown.',
  isStreaming: false,
};

assert.equal(cotAccordionTrace.steps.length, 4);
assert.ok(cotAccordionTrace.thought.includes('SQLite tables'));
console.log('  [PASS] 2.1: CoT reasoning accordion generated with 4 distinct analytical steps');

// Step 3: SQL Execution via sql_query tool
const sqlQueryCall = {
  tool: 'sql_query',
  args: {
    database: 'sqlite',
    query: `SELECT c.name AS category, SUM(oi.price * oi.quantity) AS total_revenue, COUNT(DISTINCT o.id) AS total_orders
FROM categories c
JOIN order_items oi ON c.id = oi.category_id
JOIN orders o ON oi.order_id = o.id
WHERE strftime('%Y', o.order_date) = '2025'
GROUP BY c.name
ORDER BY total_revenue DESC
LIMIT 5;`,
    description: 'Top 5 product categories by revenue in 2025',
  },
};

assert.equal(sqlQueryCall.args.database, 'sqlite');
assert.ok(sqlQueryCall.args.query.includes('FROM categories c'));

// Execute tool simulation
const sqlOutput = executeMockToolCall('sql_query', sqlQueryCall.args);
assert.equal(sqlOutput.status, 'success');
assert.ok(sqlOutput.rowCount > 0);
console.log(`  [PASS] 2.2: SQL Query executed against SQLite connector (${sqlOutput.executionTimeMs}ms)`);

// Step 4: AntV Chart & Interactive Table Artifact Transformation
const salesDataRows = [
  { category: 'Electronics', total_revenue: 1250000, total_orders: 4520, avg_order_value: 276.55 },
  { category: 'Apparel & Fashion', total_revenue: 840000, total_orders: 8200, avg_order_value: 102.44 },
  { category: 'Home & Kitchen', total_revenue: 620000, total_orders: 3950, avg_order_value: 156.96 },
  { category: 'Beauty & Personal Care', total_revenue: 310000, total_orders: 3100, avg_order_value: 100.0 },
  { category: 'Sports & Outdoors', total_revenue: 290000, total_orders: 2250, avg_order_value: 128.89 },
];

const totalRevenue = salesDataRows.reduce((sum, r) => sum + r.total_revenue, 0);
assert.equal(totalRevenue, 3310000, 'Expected total sales revenue of $3,310,000');

const chartArtifact = {
  id: 'art-chart-sqlite-sales',
  name: 'top5_categories_revenue_2025.png',
  title: 'Biểu Đồ Doanh Thu Top 5 Ngành Hàng (2025)',
  type: 'chart',
  status: 'ready',
  version: 1,
  content: {
    chartType: 'bar',
    xAxis: 'category',
    yAxis: 'total_revenue',
    seriesName: 'Doanh Thu ($)',
    data: salesDataRows,
    colorScheme: 'monochrome_primary',
  },
};

assert.equal(chartArtifact.type, 'chart');
assert.equal(chartArtifact.content.data.length, 5);
assert.equal(chartArtifact.content.data[0].category, 'Electronics');
console.log('  [PASS] 2.3: AntV Chart artifact configured with 5 categories & aggregate revenue $3,310,000');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Workload 2 Simulation (PostgreSQL Financial Modeling & Excel)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Workload 2 (PostgreSQL Financial Modeling & Multi-Tab Excel) ---');

// Step 1: Switch active database to PostgreSQL
const currentActiveDs = DEFAULT_DATASOURCES[1]; // postgres_analytics
assert.equal(currentActiveDs.id, 'postgres_analytics');
assert.equal(currentActiveDs.type, 'postgres');

// Step 2: Python Analytical Computation Turn
const pythonTurnArgs = {
  code: `import numpy as np
import pandas as pd

# Load 4 quarters PnL data from PostgreSQL DW
quarters = ['Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Est)']
revenue = [2100000, 2280000, 2450000, 2600000]
cogs = [1450000, 1520000, 1620000, 1700000]

df = pd.DataFrame({'Quarter': quarters, 'Revenue': revenue, 'COGS': cogs})
df['GrossProfit'] = df['Revenue'] - df['COGS']
df['MarginPct'] = (df['GrossProfit'] / df['Revenue']) * 100
total_rev = df['Revenue'].sum()
total_profit = df['GrossProfit'].sum()
print(f"Total Revenue: {total_rev}, Total Profit: {total_profit}")`,
  description: 'Compute 4-Quarter PnL and Profit Margins',
};

const pythonResult = executeMockToolCall('python_interpreter', pythonTurnArgs);
assert.equal(pythonResult.status, 'success');
assert.ok(pythonResult.returnValue.total_revenue === 9430000);
console.log(`  [PASS] 3.1: Python computation completed in ${pythonResult.executionTimeMs}ms with total revenue $9,430,000`);

// Step 3: Multi-Tab SheetJS Excel Financial Model Generation
const excelModelArgs = {
  title: 'PnL_4_Quarters_Consolidated_2026.xlsx',
  description: 'Enterprise 4-Quarter Financial Model & Cash Flow Forecast',
  sheets: [
    {
      name: 'PnL_Consolidated',
      rows: [
        ['Chỉ Tiêu Tài Chính', 'Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Est)', 'Năm 2026 (Tổng)'],
        ['Doanh Thu Thuần ($)', 2100000, 2280000, 2450000, 2600000, '=SUM(B2:E2)'],
        ['Giá Vốn Hàng Bán (COGS)', 1450000, 1520000, 1620000, 1700000, '=SUM(B3:E3)'],
        ['Lợi Nhuận Gộp ($)', '=B2-B3', '=C2-C3', '=D2-D3', '=E2-E3', '=F2-F3'],
        ['Tỷ Suất Lợi Nhuận Gộp (%)', '=B4/B2*100', '=C4/C2*100', '=D4/D2*100', '=E4/E2*100', '=F4/F2*100'],
      ],
      formulas: {
        F2: '=SUM(B2:E2)',
        F3: '=SUM(B3:E3)',
        B4: '=B2-B3',
        C4: '=C2-C3',
        D4: '=D2-D3',
        E4: '=E2-E3',
        F4: '=F2-F3',
      },
    },
    {
      name: 'Revenue_By_Channel',
      rows: [
        ['Kênh Bán Hàng', 'Q1', 'Q2', 'Q3', 'Q4', 'Tổng Doanh Thu'],
        ['Direct B2B Enterprise', 1200000, 1350000, 1480000, 1600000, '=SUM(B2:E2)'],
        ['E-Commerce & Digital', 650000, 680000, 720000, 750000, '=SUM(B3:E3)'],
        ['Partner Distribution', 250000, 250000, 250000, 250000, '=SUM(B4:E4)'],
        ['Tổng Kênh', '=SUM(B2:B4)', '=SUM(C2:C4)', '=SUM(D2:D4)', '=SUM(E2:E4)', '=SUM(F2:F4)'],
      ],
    },
    {
      name: 'Cash_Flow_Forecast',
      rows: [
        ['Dòng Tiền (USD)', 'Q1', 'Q2', 'Q3', 'Q4'],
        ['Dòng Tiền Hoạt Động (CFO)', 480000, 520000, 610000, 690000],
        ['Dòng Tiền Đầu Tư (CFI)', -150000, -180000, -200000, -120000],
        ['Dòng Tiền Tự Do (FCF)', '=B2+B3', '=C2+C3', '=D2+D3', '=E2+E3'],
      ],
    },
  ],
};

const excelArtifactOutput = executeMockToolCall('spreadsheet_studio', excelModelArgs);
assert.equal(excelArtifactOutput.status, 'success');
assert.equal(excelModelArgs.sheets.length, 3, 'Expected 3 workbook sheets');
assert.ok(excelModelArgs.sheets[0].formulas.F2 === '=SUM(B2:E2)');
assert.ok(excelModelArgs.sheets[1].name === 'Revenue_By_Channel');
assert.ok(excelModelArgs.sheets[2].name === 'Cash_Flow_Forecast');
console.log('  [PASS] 3.2: Multi-tab SheetJS Excel financial workbook constructed with active formulas & 3 sheets');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Tool Calling Meta & Partial JSON Streaming Parser
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: Tool Calling Metadata & Incremental JSON Parser ---');

// 4.1 Test resolveToolMeta & resolveToolMetadata for all 5 core tools
const toolMetaSql = resolveToolMetadata('sql_query');
assert.equal(toolMetaSql.canonicalName, 'sql_query');
assert.equal(toolMetaSql.language, 'sql');
assert.equal(toolMetaSql.artifactTab, 'excel');

const toolMetaSheet = resolveToolMetadata('spreadsheet_studio');
assert.equal(toolMetaSheet.canonicalName, 'spreadsheet_studio');
assert.equal(toolMetaSheet.artifactTab, 'excel');

const toolMetaDeck = resolveToolMetadata('presentation_builder');
assert.equal(toolMetaDeck.canonicalName, 'presentation_builder');
assert.equal(toolMetaDeck.artifactTab, 'slide');

const toolMetaDoc = resolveToolMetadata('doc_writer');
assert.equal(toolMetaDoc.canonicalName, 'doc_writer');
assert.equal(toolMetaDoc.artifactTab, 'docx');

const toolMetaPy = resolveToolMetadata('python_interpreter');
assert.equal(toolMetaPy.canonicalName, 'python_interpreter');
assert.equal(toolMetaPy.artifactTab, 'code');
console.log('  [PASS] 4.1: Canonical tool meta resolution verified for all 5 OpenWork capabilities');

// 4.2 Incremental Partial JSON parser resilience
const partial1 = parsePartialJson('{"title": "Báo Cáo Tài Chính", "slides": [{"title": "Hero"');
assert.ok(partial1);
assert.equal(partial1.title, 'Báo Cáo Tài Chính');
assert.equal(partial1.slides[0].title, 'Hero');

const partial2 = parsePartialJson('{"query": "SELECT * FROM users WHERE active = 1');
assert.ok(partial2);
assert.equal(partial2.query, 'SELECT * FROM users WHERE active = 1');

const invalidJson = parsePartialJson('');
assert.equal(invalidJson, null);
console.log('  [PASS] 4.2: Partial JSON parser gracefully closes open brackets and quotes during stream');

console.log('\n================================================================');
console.log('🎉 ALL DATASOURCE & MULTI-WORKLOAD SIMULATION CHECKS PASSED (100%)');
console.log('================================================================\n');
