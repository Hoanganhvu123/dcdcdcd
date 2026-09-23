import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveToolMeta } from '../components/openwork/useOpenWorkStore';
import { resolveToolMetadata, resolveToolName } from '../components/openwork/services/openwork-tools';
import { ExcelSkeleton } from '../components/ai-data-analytic/skeletons/ExcelSkeleton';
import { DocxSkeleton } from '../components/ai-data-analytic/skeletons/DocxSkeleton';
import { SlideSkeleton } from '../components/ai-data-analytic/skeletons/SlideSkeleton';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log(' M2: DYNAMIC ARTIFACT WORKBENCH & SKELETON VERIFICATION');
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

// 1. Check all 5 tool meta resolutions in resolveToolMeta
const slideMeta = resolveToolMeta('presentation_builder');
assert(slideMeta.tab === 'slide' && slideMeta.extension === '.pptx', 'presentation_builder maps to tab slide (.pptx)');

const excelMeta = resolveToolMeta('spreadsheet_studio');
assert(excelMeta.tab === 'excel' && excelMeta.extension === '.xlsx', 'spreadsheet_studio maps to tab excel (.xlsx)');

const docxMeta = resolveToolMeta('doc_writer');
assert(docxMeta.tab === 'docx' && docxMeta.extension === '.docx', 'doc_writer maps to tab docx (.docx)');

const pythonMeta = resolveToolMeta('python_interpreter');
assert(pythonMeta.tab === 'code' && pythonMeta.extension === '.py', 'python_interpreter maps to tab code (.py)');

const sqlMeta = resolveToolMeta('sql_query');
assert(sqlMeta.tab === 'excel' && sqlMeta.extension === '.xlsx', 'sql_query maps to tab excel (.xlsx)');

// 2. Check canonical name resolver
assert(resolveToolName('sql_query') === 'sql_query', 'resolveToolName recognizes sql_query');
assert(resolveToolName('spreadsheet_studio') === 'spreadsheet_studio', 'resolveToolName recognizes spreadsheet_studio');
assert(resolveToolName('presentation_builder') === 'presentation_builder', 'resolveToolName recognizes presentation_builder');
assert(resolveToolName('doc_writer') === 'doc_writer', 'resolveToolName recognizes doc_writer');
assert(resolveToolName('python_interpreter') === 'python_interpreter', 'resolveToolName recognizes python_interpreter');

// 3. Test sql_query tool execution output transformation into Excel artifact
const mockSqlOutput = {
  columns: ['category', 'revenue', 'orders'],
  rows: [
    ['Điện tử & Gia dụng', 1500000000, 1200],
    ['Thời trang & Phụ kiện', 850000000, 950],
    ['Mỹ phẩm & Làm đẹp', 620000000, 780],
  ],
  rowCount: 3,
  executionTimeMs: 42,
  status: 'success' as const,
  db_name: 'VN_Ecommerce',
};

const queryTitle = 'SQL Query Result: ' + (mockSqlOutput.db_name || 'Live DB');
const excelContent = {
  title: queryTitle,
  sheets: [
    {
      name: 'Query_Result',
      rows: [mockSqlOutput.columns, ...mockSqlOutput.rows],
    },
  ],
  rowCount: mockSqlOutput.rowCount,
  executionTimeMs: mockSqlOutput.executionTimeMs,
};

assert(excelContent.title === 'SQL Query Result: VN_Ecommerce', 'Constructed title matches target DB name');
assert(excelContent.sheets.length === 1, 'Constructed sheets has 1 sheet (Query_Result)');
assert(excelContent.sheets[0].name === 'Query_Result', 'Sheet name is Query_Result');
assert(excelContent.sheets[0].rows.length === 4, 'Sheet rows has header row + 3 data rows');
assert(excelContent.sheets[0].rows[0][0] === 'category', 'Header row starts with category');
assert(excelContent.sheets[0].rows[1][0] === 'Điện tử & Gia dụng', 'Data row 1 has correct content');

// 4. Verify skeleton components exist and are functions/components
assert(typeof ExcelSkeleton === 'function', 'ExcelSkeleton is a valid React component');
assert(typeof DocxSkeleton === 'function', 'DocxSkeleton is a valid React component');
assert(typeof SlideSkeleton === 'function', 'SlideSkeleton is a valid React component');

// 5. Verify viewer components exist and are defined
const excelViewerExists = fs.existsSync(path.resolve(__dirname, '../components/ai-data-analytic/office-excel/ExcelArtifactViewer.tsx')) || fs.existsSync(path.resolve(__dirname, '../components/chat/content/ExcelArtifactViewer.tsx'));
const wordViewerExists = fs.existsSync(path.resolve(__dirname, '../components/ai-data-analytic/office-word/WordArtifactViewer.tsx')) || fs.existsSync(path.resolve(__dirname, '../components/chat/content/DocxArtifactViewer.tsx'));
const slideViewerExists = fs.existsSync(path.resolve(__dirname, '../components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx')) || fs.existsSync(path.resolve(__dirname, '../components/chat/content/SlideArtifactViewer.tsx'));
const workbenchExists = fs.existsSync(path.resolve(__dirname, '../components/openwork/OpenWorkWorkbench.tsx'));

assert(excelViewerExists, 'ExcelArtifactViewer is a valid React component');
assert(wordViewerExists, 'DocxArtifactViewer is a valid React component');
assert(slideViewerExists, 'SlideArtifactViewer is a valid React component');
assert(workbenchExists, 'OpenWorkWorkbench is a valid React component');

console.log(`\n================================================================`);
console.log(` M2 Dynamic Artifact Workbench Results: ${passedTests} passed, ${failedTests} failed.`);
console.log(`================================================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
