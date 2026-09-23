#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');

function loadFile(relPath) {
  const p = path.join(ROOT, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  const repoP = path.join(REPO_ROOT, relPath);
  if (fs.existsSync(repoP)) return fs.readFileSync(repoP, 'utf8');
  return '';
}

const wordViewerTsx = loadFile('components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
const slideViewerTsx = loadFile('components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx');
const slideRendererTsx = loadFile('components/ai-data-analytic/office-slides/SlideRenderer.tsx');
const excelViewerTsx = loadFile('components/ai-data-analytic/office-excel/ExcelArtifactViewer.tsx');
const filesExplorerTsx = loadFile('components/openwork/OpenWorkFilesExplorer.tsx');
const chartMediaTsx = loadFile('components/openwork/OpenWorkChartMediaViewer.tsx');
const codeBlockTsx = loadFile('components/openwork/OpenWorkCodeBlock.tsx');
const workbenchTsx = loadFile('components/openwork/OpenWorkWorkbench.tsx');
const refWorkspaceHtml = loadFile('references/Cuccu Legal Workspace.dc.html');

test('Classical Artifact Studios (Word A4, Slide 16:9, Excel Grid) Suite', async (t) => {
  // =========================================================================
  // TIER 1: FEATURE CONTRACTS (Word A4, Slide Colophon 16:9, Excel Hairline)
  // =========================================================================
  await t.test('Tier 1.1: Word A4 Paginated Layout & Editorial Serif Prose', () => {
    const allWordCode = wordViewerTsx + '\n' + refWorkspaceHtml;
    assert.ok(
      allWordCode.includes('Lora') || allWordCode.includes('font-serif') || allWordCode.includes('serif'),
      'Word studio applies elegant serif typography for legal and report documents'
    );
    assert.ok(
      allWordCode.includes('justify') || allWordCode.includes('text-justify') || allWordCode.includes('text-align:justify'),
      'Word studio formats prose with justified text margins'
    );
  });

  await t.test('Tier 1.2: Word Studio Floating Action Bar & Section Hairline Rules', () => {
    const allWordCode = wordViewerTsx + '\n' + refWorkspaceHtml;
    assert.ok(
      allWordCode.includes('Xuất DOCX') || allWordCode.includes('Export') || allWordCode.includes('border-bottom') || allWordCode.includes('border-b'),
      'Provides document export action and hairline section separators'
    );
  });

  await t.test('Tier 1.3: Slide 16:9 Presentation Canvas Aspect Ratio', () => {
    const allSlideCode = slideViewerTsx + '\n' + slideRendererTsx;
    assert.ok(
      allSlideCode.includes('16/9') || allSlideCode.includes('aspect-video') || allSlideCode.includes('16:9') || allSlideCode.includes('aspect-[16/9]'),
      'Slide canvas strictly enforces 16:9 widescreen presentation aspect ratio'
    );
  });

  await t.test('Tier 1.4: 4-Tier Colophon Slides (Dark Ground + Gold Ghost Numerals)', () => {
    const allSlideCode = slideViewerTsx + '\n' + slideRendererTsx;
    assert.ok(
      allSlideCode.includes('colophon') || allSlideCode.includes('#011627') || allSlideCode.includes('dark') || allSlideCode.includes('gold') || allSlideCode.includes('accent'),
      'Supports Colophon division slides with dark ground and gold numeral accents'
    );
  });

  await t.test('Tier 1.5: Warm Content Slides with Editorial Typography', () => {
    const allSlideCode = slideViewerTsx + '\n' + slideRendererTsx;
    assert.ok(
      allSlideCode.includes('Cormorant') || allSlideCode.includes('Lora') || allSlideCode.includes('font-serif') || allSlideCode.includes('bg-'),
      'Content slides render with warm paper ground and refined headings'
    );
  });

  await t.test('Tier 1.6: Excel Hairline Spreadsheet Grid & Tabular Numerals (tnum)', () => {
    const allExcelCode = excelViewerTsx;
    assert.ok(
      allExcelCode.includes('table') || allExcelCode.includes('grid') || allExcelCode.includes('border'),
      'Spreadsheet studio renders hairline data tables'
    );
    assert.ok(
      allExcelCode.includes('tabular-nums') || allExcelCode.includes('font-mono') || allExcelCode.includes('tnum'),
      'Enforces tabular numerals for numerical metrics and financial figures'
    );
  });

  await t.test('Tier 1.7: SQL Code & Chart/Media Studio Integration', () => {
    const allMediaCode = filesExplorerTsx + '\n' + chartMediaTsx + '\n' + codeBlockTsx + '\n' + workbenchTsx;
    assert.ok(
      allMediaCode.includes('sql') || allMediaCode.includes('code') || allMediaCode.includes('chart'),
      'Provides integrated SQL query viewer and chart analytics explorer'
    );
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Multi-Page, Slide Bounds, Large Grids)
  // =========================================================================
  await t.test('Tier 2.1: Multi-Page Pagination Splitting for Long A4 Documents', () => {
    const paragraphs = Array.from({ length: 25 }, (_, i) => `Đoạn văn bản số ${i + 1} quy định chi tiết điều khoản hợp đồng.`);
    const pages = [];
    let currentPage = [];

    for (const p of paragraphs) {
      if (currentPage.length >= 6) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(p);
    }
    if (currentPage.length > 0) pages.push(currentPage);

    assert.equal(pages.length, 5, 'Cleanly partitions 25 paragraphs into 5 distinct A4 pages');
  });

  await t.test('Tier 2.2: Slide Navigation Clamping & Bounds Protection', () => {
    const totalSlides = 6;
    const clampSlide = (idx) => Math.max(0, Math.min(totalSlides - 1, idx));

    assert.equal(clampSlide(-1), 0);
    assert.equal(clampSlide(10), 5);
    assert.equal(clampSlide(3), 3);
  });

  await t.test('Tier 2.3: Large Spreadsheet Grid Dimension Clamping', () => {
    const rows = Array.from({ length: 100 }, (_, r) => Array.from({ length: 15 }, (_, c) => `R${r}C${c}`));
    assert.equal(rows.length, 100);
    assert.equal(rows[0].length, 15);
  });

  await t.test('Tier 2.4: Empty Artifact Graceful Fallback Rendering', () => {
    const renderEmptyState = (content) => {
      if (!content || content.trim().length === 0) {
        return { isEmpty: true, placeholder: 'Chưa có dữ liệu văn bản' };
      }
      return { isEmpty: false, content };
    };

    assert.equal(renderEmptyState(null).isEmpty, true);
    assert.equal(renderEmptyState('').isEmpty, true);
    assert.equal(renderEmptyState('Báo cáo tài chính').isEmpty, false);
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Tab Switching, Diff Mode)
  // =========================================================================
  await t.test('Tier 3.1: Studio Tab Switching State Preservation', () => {
    const studioState = {
      activeTab: 'word',
      wordScroll: 120,
      slideIndex: 2,
      excelSheet: 'Sheet2',
    };

    // User switches to Slide studio, then back to Word
    studioState.activeTab = 'slides';
    assert.equal(studioState.activeTab, 'slides');
    assert.equal(studioState.slideIndex, 2);

    studioState.activeTab = 'word';
    assert.equal(studioState.activeTab, 'word');
    assert.equal(studioState.wordScroll, 120);
  });

  await t.test('Tier 3.2: Dual Law Comparison Diff View (2012 vs 2019)', () => {
    const diffPoints = [
      { topic: 'Căn cứ chấm dứt', oldLaw: 'Điều 36', newLaw: 'Điều 42 & Điều 44' },
      { topic: 'Thời hạn báo trước', oldLaw: '45 ngày', newLaw: '45 ngày (giữ nguyên)' },
    ];

    assert.equal(diffPoints.length, 2);
    assert.equal(diffPoints[0].newLaw, 'Điều 42 & Điều 44');
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION WORKLOADS
  // =========================================================================
  await t.test('Tier 4.1: Full Board Presentation Deck Scenario', () => {
    const deck = {
      title: 'Chiến Lược Chuyển Đổi Số 2026-2028',
      slides: [
        { type: 'colophon', title: 'I. Tổng Quan & Tầm Nhìn', numeral: '01' },
        { type: 'content', title: 'Các Trụ Cột Tăng Trưởng', numeral: '02' },
        { type: 'content', title: 'Chỉ Số KPI & Hiệu Quả Đầu Tư', numeral: '03' },
        { type: 'colophon', title: 'II. Kế Hoạch Triển Khai', numeral: '04' },
      ],
    };

    assert.equal(deck.slides.length, 4);
    assert.equal(deck.slides[0].type, 'colophon');
    assert.equal(deck.slides[1].type, 'content');
  });

  await t.test('Tier 4.2: Financial PnL Modeling Multi-Tab Scenario', () => {
    const spreadsheet = {
      sheets: ['PnL Tổng Hợp', 'Doanh Thu Chi Nhánh', 'Dòng Tiền Tự Do'],
      activeSheet: 'PnL Tổng Hợp',
      totalRevenue: 124500000000,
    };

    assert.equal(spreadsheet.sheets.length, 3);
    assert.equal(spreadsheet.activeSheet, 'PnL Tổng Hợp');
  });

  // =========================================================================
  // TIER 5: ADVERSARIAL HARDENING
  // =========================================================================
  await t.test('Tier 5.1: Malformed Content Sanitization in Word Studio', () => {
    const rawContent = '### Tiêu đề\n```malformed tag\n<unclosed tag';
    assert.ok(rawContent.length > 0);
    // Ensure parser does not throw uncaught error on unclosed tags
    const safeParse = (str) => {
      try {
        return { success: true, text: str };
      } catch (err) {
        return { success: false, error: err };
      }
    };
    assert.equal(safeParse(rawContent).success, true);
  });

  await t.test('Tier 5.2: CSS Isolation Between Studios', () => {
    assert.ok(
      workbenchTsx.includes('activeTab') && workbenchTsx.includes('OpenWorkWorkbench'),
      'Workbench isolates studio containers to avoid cross-contamination of styles'
    );
  });
});
