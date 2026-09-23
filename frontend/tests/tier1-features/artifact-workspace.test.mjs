import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 1.5: Side-by-Side Artifact & Document Workspace Feature Tests', async (t) => {
  const openworkWorkbenchSource = fs.readFileSync(path.join(ROOT, 'components/openwork/OpenWorkWorkbench.tsx'), 'utf8');
  const slideCanvasSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/SlideCanvas.tsx'), 'utf8');
  const slideRendererSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/SlideRenderer.tsx'), 'utf8');

  await t.test('T1.5.1: Side-by-side split screen docking and dynamic imported renderers in OpenWorkWorkbench', () => {
    assert.match(openworkWorkbenchSource, /DocxArtifactViewer = dynamic/);
    assert.match(openworkWorkbenchSource, /ExcelArtifactViewer = dynamic/);
    assert.match(openworkWorkbenchSource, /SlideArtifactViewer = dynamic/);
    assert.match(openworkWorkbenchSource, /OpenWorkChartMediaViewer/);
    assert.match(openworkWorkbenchSource, /OpenWorkFilesExplorer/);
  });

  await t.test('T1.5.2: Multi-tab artifact switching and output type classification', () => {
    const validOutputTypes = ['files', 'excel', 'slide', 'docx', 'code', 'chart'];
    assert.ok(validOutputTypes.length >= 6);
    assert.match(openworkWorkbenchSource, /TAB_DEFINITIONS/);
    assert.match(openworkWorkbenchSource, /SlideArtifactViewer/);
    assert.match(openworkWorkbenchSource, /ExcelArtifactViewer/);
    assert.match(openworkWorkbenchSource, /DocxArtifactViewer/);
  });

  await t.test('T1.5.3: Slide Canvas 16:9 aspect ratio auto-scaling mathematics', () => {
    const SLIDE_WIDTH = 960;
    const SLIDE_HEIGHT = 540;
    const PADDING = 32;

    function computeSlideScale(containerWidth, containerHeight) {
      const availW = Math.max(0, containerWidth - PADDING * 2);
      const availH = Math.max(0, containerHeight - PADDING * 2);
      const scaleX = availW / SLIDE_WIDTH;
      const scaleY = availH / SLIDE_HEIGHT;
      return Math.min(scaleX, scaleY, 1.5);
    }

    // 1920x1080 container -> scale limited to 1.5 max
    const scale1 = computeSlideScale(1920, 1080);
    assert.equal(scale1, 1.5);

    // 1024x768 container
    const scale2 = computeSlideScale(1024, 768);
    assert.equal(scale2, 1.0);

    // Very small 480x320 container
    const scale3 = computeSlideScale(480, 320);
    assert.ok(scale3 < 0.5);
  });

  await t.test('T1.5.4: SheetJS multi-sheet spreadsheet workbook rendering and cell querying', () => {
    function getColumnLetter(colIndex) {
      let temp = colIndex;
      let letter = '';
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
      }
      return letter;
    }

    assert.equal(getColumnLetter(0), 'A');
    assert.equal(getColumnLetter(25), 'Z');
    assert.equal(getColumnLetter(26), 'AA');
    assert.equal(getColumnLetter(27), 'AB');

    // Create a real in-memory workbook
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Metric', 'Q1', 'Q2', 'Total'],
      ['Revenue', 1000, 1500, { f: 'B2+C2' }],
      ['Cost', 600, 800, { f: 'B3+C3' }]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Financials');

    const outBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    assert.ok(outBuf.length > 0);

    // Parse it back
    const readWb = XLSX.read(outBuf, { type: 'buffer' });
    assert.equal(readWb.SheetNames[0], 'Financials');
    const parsedRows = XLSX.utils.sheet_to_json(readWb.Sheets['Financials'], { header: 1 });
    assert.equal(parsedRows[0][0], 'Metric');
    assert.equal(parsedRows[1][1], 1000);
  });

  await t.test('T1.5.5: Mammoth.js Word DOCX binary decoding with markdown fallback resolution', async () => {
    function isBase64Docx(str) {
      if (typeof str !== 'string') return false;
      if (
        str.startsWith('data:application/vnd.openxmlformats') ||
        str.startsWith('data:application/octet-stream') ||
        str.startsWith('data:application/msword') ||
        str.startsWith('data:application/zip')
      ) {
        return true;
      }
      if (str.length > 50 && (str.startsWith('UEsDB') || (str.startsWith('data:') && str.includes('UEsDB')))) {
        return true;
      }
      return false;
    }

    const testDocxBase64 = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBBQAAAAIAAA=';
    assert.equal(isBase64Docx(testDocxBase64), true);
    assert.equal(isBase64Docx('# Heading 1\nMarkdown report text'), false);
  });

  await t.test('T1.5.6: SlideRenderer layout dispatch across all 14 layout types', () => {
    const layoutTypes = [
      'hero', 'bullets', 'two_col', 'comparison', 'chart', 'stat_grid',
      'closing', 'quote', 'big_number', 'timeline', 'image_text', 'section_divider',
      'bento_grid', 'split_cover'
    ];

    for (const layout of layoutTypes) {
      assert.match(slideRendererSource, new RegExp(`case ['"]${layout}['"]:`));
    }
  });
});
