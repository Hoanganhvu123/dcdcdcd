import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 1.1: Modern Sidebar & Navigation Feature Tests', async (t) => {
  const sideBarSource = fs.readFileSync(path.join(ROOT, 'components/layout/side-bar.tsx'), 'utf8');
  const openworkSidebarSource = fs.readFileSync(path.join(ROOT, 'components/openwork/OpenWorkSidebar.tsx'), 'utf8');

  await t.test('T1.1.1: 100% Ant Design & @ant-design/icons elimination in modern sidebar', () => {
    // Verifies zero antd and @ant-design/icons imports
    assert.equal(/from ['"]antd['"]/.test(sideBarSource), false, 'Must not import from antd in side-bar');
    assert.equal(/from ['"]@ant-design\/icons['"]/.test(sideBarSource), false, 'Must not import from @ant-design/icons in side-bar');
    assert.equal(/from ['"]antd['"]/.test(openworkSidebarSource), false, 'Must not import from antd in OpenWorkSidebar');
    assert.equal(/from ['"]@ant-design\/icons['"]/.test(openworkSidebarSource), false, 'Must not import from @ant-design/icons in OpenWorkSidebar');
  });

  await t.test('T1.1.2: Shadcn / Radix UI integration and Lucide icons in sidebars', () => {
    // Verifies Radix/Shadcn UI imports
    assert.match(sideBarSource, /Popover|Tooltip/);
    assert.match(sideBarSource, /lucide-react/);
    assert.match(openworkSidebarSource, /lucide-react/);
    assert.match(openworkSidebarSource, /SessionDotMatrixLoader/);
  });

  await t.test('T1.1.3: New conversation trigger and shortcut hint (Ctrl K / new_task)', () => {
    // Verifies new task trigger and keyboard shortcut badge
    assert.match(sideBarSource, /Ctrl\s*K/i);
    assert.match(sideBarSource, /new_task/);
    assert.match(openworkSidebarSource, /onNewSession/);
  });

  await t.test('T1.1.4: Dialogue history management and OpenWork session filtering', () => {
    // Verifies dialogue list management and OpenWork session search filter
    assert.match(sideBarSource, /fetchDialogueList|dialogueList/);
    assert.match(sideBarSource, /handleDeleteDialogue/);
    assert.match(openworkSidebarSource, /searchQuery/);
    assert.match(openworkSidebarSource, /filteredSessions/);
  });

  await t.test('T1.1.5: Theme switcher, language selector, and settings affordance', () => {
    // Verifies theme switcher (light/dark), language selector, and affordances
    assert.match(sideBarSource, /STORAGE_THEME_KEY/);
    assert.match(sideBarSource, /STORAGE_LANG_KEY/);
    assert.match(sideBarSource, /useRegisterAffordance/);
    assert.match(sideBarSource, /toast/);
    assert.match(openworkSidebarSource, /onOpenSettings/);
  });

  await t.test('T1.1.6: Responsive layout, spring transitions, and custom styling', () => {
    // Verifies Framer Motion spring transitions and responsive width variants
    assert.match(sideBarSource, /framer-motion/);
    assert.match(sideBarSource, /transition=\{\{\s*type:\s*['"]spring['"]/);
    assert.match(sideBarSource, /240px/);
    assert.match(sideBarSource, /80px/);
  });
});
