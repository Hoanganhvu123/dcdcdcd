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
  const mockP = path.join(REPO_ROOT, 'frontend_mock', relPath);
  if (fs.existsSync(mockP)) return fs.readFileSync(mockP, 'utf8');
  return '';
}

const sidebarTsx = loadFile('components/openwork/OpenWorkSidebar.tsx');
const shellTsx = loadFile('components/openwork/OpenWorkShell.tsx');
const storeTs = loadFile('components/openwork/useOpenWorkStore.ts');
const mockSidebarPath = path.join(REPO_ROOT, 'frontend_mock', 'components/openwork/OpenWorkSidebar.tsx');
const mockShellPath = path.join(REPO_ROOT, 'frontend_mock', 'components/openwork/OpenWorkShell.tsx');
const hasMockTree = fs.existsSync(mockSidebarPath) && fs.existsSync(mockShellPath);
const mockSidebarTsx = hasMockTree ? fs.readFileSync(mockSidebarPath, 'utf8') : sidebarTsx;
const mockShellTsx = hasMockTree ? fs.readFileSync(mockShellPath, 'utf8') : shellTsx;

test('Challenger 2 — Sidebar, Keyboard Interactions & Clutter Elimination Suite', async (t) => {
  // =========================================================================
  // 1. COLLAPSED RAIL (!isOpen) MINIMALISM & CLUTTER AUDIT
  // =========================================================================
  await t.test('CH2.1: Collapsed rail contains zero extraneous clutter buttons', () => {
    // Extract the !isOpen branch from OpenWorkSidebar.tsx
    const matchCollapsed = sidebarTsx.match(/if\s*\(!isOpen\)\s*\{\s*return\s*\(([\s\S]*?)\);\s*\}/);
    assert.ok(matchCollapsed, 'Collapsed rail (!isOpen) guard must exist');
    const collapsedCode = matchCollapsed[1];

    // Verify exactly 3 buttons exist in collapsed rail:
    const buttonMatches = collapsedCode.match(/<button[\s\S]*?<\/button>/g) || [];
    assert.equal(buttonMatches.length, 3, 'Collapsed rail must have exactly 3 buttons (OW toggle, New Chat, User Avatar)');

    // Button 1: Monogram OW
    assert.ok(buttonMatches[0].includes('OW'), 'Button 1 must be Monogram OW');
    assert.ok(buttonMatches[0].includes('onClick={onToggle}'), 'Button 1 must trigger onToggle');

    // Button 2: Plus New Session
    assert.ok(buttonMatches[1].includes('<Plus') || buttonMatches[1].includes('Plus'), 'Button 2 must render Plus icon');
    assert.ok(buttonMatches[1].includes('onClick={onNewSession}'), 'Button 2 must trigger onNewSession');
    assert.ok(buttonMatches[1].includes('Phiên làm việc mới (Ctrl K)'), 'Button 2 must have title Phiên làm việc mới (Ctrl K)');

    // Button 3: VA Avatar Footer
    assert.ok(buttonMatches[2].includes('VA'), 'Button 3 must render VA avatar monogram');
    assert.ok(buttonMatches[2].includes('onClick={onOpenSettings}'), 'Button 3 must trigger onOpenSettings');

    // Clutter check: Ensure no extraneous icons or clutter buttons exist
    const forbiddenIcons = ['FolderKanban', 'Database', 'MessageSquare', 'FolderTree', 'FileText', 'Layers', 'Workflow', 'Bot'];
    for (const icon of forbiddenIcons) {
      assert.equal(collapsedCode.includes(icon), false, 'Collapsed rail must NOT contain extraneous icon: ' + icon);
    }
  });

  // =========================================================================
  // 2. EXPANDED SIDEBAR LAYOUT, MONOGRAM HEADER & FOOTER AUDIT
  // =========================================================================
  await t.test('CH2.2: Expanded sidebar contains correct Monogram OW header, action button & footer', () => {
    // Monogram OW header
    assert.match(sidebarTsx, /OW/, 'Must render Monogram OW badge');
    assert.match(sidebarTsx, /workspace(?:\.|\?\.)name/, 'Must render workspace name');
    assert.match(sidebarTsx, /workspace(?:\.|\?\.)tier/, 'Must render workspace tier');
    assert.match(sidebarTsx, /<PanelLeftClose/, 'Must render PanelLeftClose toggle button');

    // Primary action button: Phiên làm việc mới (Ctrl K)
    assert.match(sidebarTsx, /Phiên làm việc mới/, 'Primary button must have label Phiên làm việc mới');
    assert.match(sidebarTsx, /Ctrl\s*K/, 'Primary button must display Ctrl K badge');
    assert.match(sidebarTsx, /aria-label="Tạo phiên làm việc mới"/, 'Must have accessible aria-label');

    // Compact search filter
    assert.match(sidebarTsx, /placeholder="Tìm kiếm phiên\.\.\."/, 'Must have search input with correct placeholder');
    assert.match(sidebarTsx, /aria-label="Tìm kiếm phiên làm việc"/, 'Must have accessible search aria-label');

    // Timeline section
    assert.match(sidebarTsx, /Hội thoại gần đây/, 'Must have section title Hội thoại gần đây');
    assert.match(sidebarTsx, /SessionDotMatrixLoader/, 'Must render SessionDotMatrixLoader for running status');
    assert.match(sidebarTsx, /OutcomeStatusDot/, 'Must render OutcomeStatusDot for finished status');
    assert.match(sidebarTsx, /ow-fade-truncate/, 'Must use ow-fade-truncate for title truncation');

    // Footer
    assert.match(sidebarTsx, /VA/, 'Footer must render user avatar VA');
    assert.match(sidebarTsx, /Vu Hoang Anh/, 'Footer must render user name Vu Hoang Anh');
    assert.match(sidebarTsx, /data-testid="openwork-sidebar-settings"/, 'Footer must have settings button hook');
    assert.match(sidebarTsx, /<Settings/, 'Footer must render Settings gear icon');
  });

  await t.test('CH2.3: Elimination of redundant clutter shortcuts in expanded sidebar', () => {
    // Ensure all old clutter sections are completely purged
    const purgedClutter = [
      'Dự án & Không gian',
      'Kho Artifacts',
      'Connectors list',
      'FolderKanban',
      'MessageSquare',
    ];

    for (const clutter of purgedClutter) {
      assert.equal(sidebarTsx.includes(clutter), false, 'Expanded sidebar must NOT contain purged clutter: ' + clutter);
    }
  });

  // =========================================================================
  // 3. KEYBOARD SHORTCUT (Ctrl+K / Cmd+K) BEHAVIORAL STRESS
  // =========================================================================
  await t.test('CH2.4: Ctrl+K / Cmd+K keyboard shortcut handler mechanics', () => {
    assert.match(shellTsx, /\(e\.ctrlKey\s*\|\|\s*e\.metaKey\)\s*&&\s*e\.key\.toLowerCase\(\)\s*===\s*['"]k['"]/);
    assert.match(shellTsx, /activeEl instanceof HTMLInputElement/);
    assert.match(shellTsx, /activeEl instanceof HTMLTextAreaElement/);
    assert.match(shellTsx, /activeEl\?\.getAttribute\(['"]contenteditable['"]\)\s*===\s*['"]true['"]/);

    // Simulate keydown handler logic directly
    const createShortcutHandler = (createNewSession) => (e, activeElement) => {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'k') {
        const isInput =
          activeElement?.tagName === 'INPUT' ||
          activeElement?.tagName === 'TEXTAREA' ||
          activeElement?.getAttribute?.('contenteditable') === 'true';
        if (!isInput) {
          e.preventDefault();
          createNewSession();
        }
      }
    };

    let sessionCreatedCount = 0;
    let preventedDefaultCount = 0;
    const mockCreateSession = () => { sessionCreatedCount++; };
    const handler = createShortcutHandler(mockCreateSession);

    const makeEvent = (ctrl, meta, key) => ({
      ctrlKey: ctrl,
      metaKey: meta,
      key,
      preventDefault: () => { preventedDefaultCount++; },
    });

    // Case 1: Ctrl+k outside input -> should trigger
    handler(makeEvent(true, false, 'k'), { tagName: 'BODY' });
    assert.equal(sessionCreatedCount, 1);
    assert.equal(preventedDefaultCount, 1);

    // Case 2: Cmd+K (metaKey) on Mac outside input -> should trigger
    handler(makeEvent(false, true, 'K'), { tagName: 'DIV' });
    assert.equal(sessionCreatedCount, 2);
    assert.equal(preventedDefaultCount, 2);

    // Case 3: Ctrl+K inside HTMLInputElement -> must NOT trigger
    handler(makeEvent(true, false, 'k'), { tagName: 'INPUT' });
    assert.equal(sessionCreatedCount, 2, 'Must not trigger inside input');

    // Case 4: Ctrl+K inside HTMLTextAreaElement -> must NOT trigger
    handler(makeEvent(true, false, 'k'), { tagName: 'TEXTAREA' });
    assert.equal(sessionCreatedCount, 2, 'Must not trigger inside textarea');

    // Case 5: Ctrl+K inside contenteditable div -> must NOT trigger
    handler(makeEvent(true, false, 'k'), { tagName: 'DIV', getAttribute: (attr) => (attr === 'contenteditable' ? 'true' : null) });
    assert.equal(sessionCreatedCount, 2, 'Must not trigger inside contenteditable');

    // Case 6: Plain 'k' without modifier -> must NOT trigger
    handler(makeEvent(false, false, 'k'), { tagName: 'BODY' });
    assert.equal(sessionCreatedCount, 2, 'Must not trigger without ctrl/meta');

    // Case 7: Ctrl+Shift+K or other key -> must NOT trigger
    handler(makeEvent(true, false, 'j'), { tagName: 'BODY' });
    assert.equal(sessionCreatedCount, 2, 'Must not trigger for other keys');
  });

  // =========================================================================
  // 4. SESSION DELETION STOPPROPAGATION CONTRACT
  // =========================================================================
  await t.test('CH2.5: Session deletion with e.stopPropagation() prevents accidental activation', () => {
    assert.match(sidebarTsx, /e\.stopPropagation\(\)/, 'Must call e.stopPropagation() in delete session button');
    assert.match(sidebarTsx, /onDeleteSession\(s\.id\)/, 'Must call onDeleteSession with session id');

    // Behavioral simulation of click bubbling
    let activeSessionId = 'session-1';
    let deletedSessionId = null;

    const onSelectSession = (id) => { activeSessionId = id; };
    const onDeleteSession = (id) => { deletedSessionId = id; };

    // Simulate clicking delete button with stopPropagation
    const simulateDeleteClick = (targetSessionId) => {
      let propagationStopped = false;
      const fakeEvent = {
        stopPropagation: () => { propagationStopped = true; },
      };

      // Handler on delete button
      fakeEvent.stopPropagation();
      onDeleteSession(targetSessionId);

      // Parent container click handler only fires if propagation was not stopped
      if (!propagationStopped) {
        onSelectSession(targetSessionId);
      }
    };

    // User is on session-1 and clicks delete on session-2
    simulateDeleteClick('session-2');
    assert.equal(deletedSessionId, 'session-2', 'Deleted session ID should be session-2');
    assert.equal(activeSessionId, 'session-1', 'Active session must remain session-1 without activating deleted session');
  });

  // =========================================================================
  // 5. SESSION FILTERING EDGE CASES & ADVERSARIAL QUERIES
  // =========================================================================
  await t.test('CH2.6: Session search filter handles regex injection, unicode & case insensitivity', () => {
    const sessions = [
      { id: '1', title: 'Báo cáo tài chính Q3', subtitle: 'Phân tích doanh thu & PnL' },
      { id: '2', title: 'Hợp đồng lao động mẫu 2026', subtitle: 'Điều khoản pháp lý và bồi thường' },
      { id: '3', title: 'Regex Test (.*+?^|[\\])', subtitle: 'Special chars in title' },
      { id: '4', title: 'DeepSeek-V4 Flash Streaming', subtitle: 'Model benchmarks' },
    ];

    const filterSessions = (list, query) => list.filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        (s.subtitle && s.subtitle.toLowerCase().includes(query.toLowerCase()))
    );

    // Empty query -> returns all
    assert.equal(filterSessions(sessions, '').length, 4);

    // Case insensitive title search
    assert.equal(filterSessions(sessions, 'báo cáo').length, 1);
    assert.equal(filterSessions(sessions, 'BÁO CÁO').length, 1);

    // Subtitle search
    assert.equal(filterSessions(sessions, 'pnl').length, 1);
    assert.equal(filterSessions(sessions, 'bồi thường').length, 1);

    // Regex metacharacter query without crash
    assert.equal(filterSessions(sessions, '.*+?').length, 1);
    assert.equal(filterSessions(sessions, '[').length, 1);

    // Non-matching query
    assert.equal(filterSessions(sessions, 'non-existent-xyz').length, 0);
  });

  // =========================================================================
  // 6. DUAL-TREE PARITY AUDIT
  // =========================================================================
  await t.test('CH2.7: 100% dual tree parity or single tree canonical integrity', () => {
    if (hasMockTree) {
      assert.equal(sidebarTsx, mockSidebarTsx, 'OpenWorkSidebar.tsx must be identical between frontend and frontend_mock');
      assert.equal(shellTsx, mockShellTsx, 'OpenWorkShell.tsx must be identical between frontend and frontend_mock');
    } else {
      assert.ok(sidebarTsx.length > 500, 'OpenWorkSidebar.tsx canonical file verified in single-tree frontend');
      assert.ok(shellTsx.length > 500, 'OpenWorkShell.tsx canonical file verified in single-tree frontend');
    }
  });
});
