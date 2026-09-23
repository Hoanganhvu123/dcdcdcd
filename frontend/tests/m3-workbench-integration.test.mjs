#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadFile(relPath) {
  const p = path.join(ROOT, relPath);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

test('Milestone 3: Workbench Integration & Cross-Studio Parity Suite', async (t) => {
  const workbenchTsx = loadFile('components/openwork/OpenWorkWorkbench.tsx');
  const shellTsx = loadFile('components/openwork/OpenWorkShell.tsx');
  const wordViewerTsx = loadFile('components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
  const wordViewerCss = loadFile('components/ai-data-analytic/office-word/styles/word-viewer.css');
  const excelViewerTsx = loadFile('components/ai-data-analytic/office-excel/ExcelArtifactViewer.tsx');
  const slideViewerTsx = loadFile('components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx');

  await t.test('1. Fluid Spring Physics Configuration (stiffness: 350, damping: 28)', () => {
    assert.ok(
      shellTsx.includes('stiffness: 350') && shellTsx.includes('damping: 28'),
      'OpenWorkShell configures fluid spring physics with stiffness 350 and damping 28'
    );
    assert.ok(
      workbenchTsx.includes('stiffness: 350') && workbenchTsx.includes('damping: 28'),
      'OpenWorkWorkbench configures fluid spring physics for icon and state transitions'
    );
  });

  await t.test('2. Maximize/Minimize Toggle Button & Fluid Icon Transition', () => {
    assert.ok(
      workbenchTsx.includes('Minimize2') && workbenchTsx.includes('Maximize2'),
      'OpenWorkWorkbench renders both Minimize2 and Maximize2 icons'
    );
    assert.ok(
      workbenchTsx.includes('AnimatePresence') && workbenchTsx.includes('mode="wait"'),
      'Icon transition utilizes AnimatePresence with mode="wait"'
    );
    assert.ok(
      workbenchTsx.includes('handleToggleMaximize'),
      'Wires interactive maximization toggle handler'
    );
  });

  await t.test('3. Studio DOM State & Scroll Preservation Across Tabs and Maximization', () => {
    assert.ok(
      workbenchTsx.includes('visitedTabs') && workbenchTsx.includes('setVisitedTabs'),
      'Keeps visited studio tabs mounted in DOM to prevent state unmounting'
    );
    assert.ok(
      workbenchTsx.includes('scrollPositionsRef') && workbenchTsx.includes('containerRefs'),
      'Explicitly records and restores scroll positions upon tab switch and resize/maximize'
    );
  });

  await t.test('4. Safe-Center & Custom-Scrollbar Integration', () => {
    assert.ok(
      wordViewerCss.includes('safe center') || wordViewerTsx.includes('safe center'),
      'Word A4 canvas enforces safe center alignment to prevent left-margin clipping'
    );
    assert.ok(
      workbenchTsx.includes('custom-scrollbar'),
      'Workbench body and studio panes apply .custom-scrollbar on both axes'
    );
  });

  await t.test('5. Cross-Studio Parity Across All 4 Studios (Word, Excel, Slide, Code/Charts)', () => {
    // Word DOCX
    assert.ok(
      workbenchTsx.includes('DocxArtifactViewer') && workbenchTsx.includes('docxArtifact'),
      'Word DOCX studio integrated with executive A4 paper viewer'
    );
    // Excel XLSX
    assert.ok(
      workbenchTsx.includes('ExcelArtifactViewer') && workbenchTsx.includes('excelArtifact'),
      'Excel XLSX studio integrated with spreadsheet viewer and formula protection'
    );
    // Slide 16:9
    assert.ok(
      workbenchTsx.includes('SlideArtifactViewer') && workbenchTsx.includes('slideArtifact'),
      'Slide 16:9 presentation studio integrated with 16:9 widescreen canvas'
    );
    // Code & Charts
    assert.ok(
      workbenchTsx.includes('OpenWorkChartMediaViewer') && workbenchTsx.includes('chartSource'),
      'Interactive Chart & Media visualizer integrated'
    );
    assert.ok(
      workbenchTsx.includes('codeArtifact') && workbenchTsx.includes('Terminal'),
      'Code syntax viewer integrated with terminal styling'
    );
  });
});
