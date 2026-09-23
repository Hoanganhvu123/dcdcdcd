import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 1.2: Glassmorphism Sticky Header Feature Tests', async (t) => {
  const headerSource = fs.readFileSync(path.join(ROOT, 'components/chat/header/ChatHeader.tsx'), 'utf8');
  const layoutHeaderSource = fs.readFileSync(path.join(ROOT, 'components/layout/Header.tsx'), 'utf8');
  const openworkHeaderSource = fs.readFileSync(path.join(ROOT, 'components/openwork/OpenWorkHeader.tsx'), 'utf8');
  const headerCss = fs.readFileSync(path.join(ROOT, 'components/chat/header/styles/chat-header.css'), 'utf8');

  await t.test('T1.2.1: Sticky glassmorphism styling and backdrop-blur properties', () => {
    assert.match(headerSource, /chat-header-normal/);
    assert.match(headerCss, /\.chat-header-normal/);
    assert.match(headerCss, /backdrop-filter:\s*blur/);
    assert.match(headerCss, /position:\s*sticky/);
  });

  await t.test('T1.2.2: Dynamic model & scene badges rendering with rounded-full pill styling', () => {
    assert.match(headerSource, /appInfo\?\.team_mode/);
    assert.match(headerSource, /appInfo\?\.team_context\?\.chat_scene/);
    assert.match(headerSource, /rounded-full/);
  });

  await t.test('T1.2.3: App description truncation handling with title tooltip', () => {
    assert.match(headerSource, /chat-header-desc/);
    assert.match(headerSource, /truncate/);
    assert.match(headerSource, /title=\{appInfo\?\.app_describe\}/);
  });

  await t.test('T1.2.4: Share application link copy action with clipboard integration', () => {
    assert.match(headerSource, /copy\(location\.href\)/);
    assert.match(headerSource, /t\('copy_success'\)/);
  });

  await t.test('T1.2.5: Application collect / favorite toggle state mutation with Lucide icons', () => {
    assert.match(headerSource, /collectApp/);
    assert.match(headerSource, /unCollectApp/);
    assert.match(headerSource, /isCollected/);
    assert.match(headerSource, /Star/);
  });

  await t.test('T1.2.6: Header spring animation physics configuration', () => {
    assert.match(headerSource, /type:\s*['"]spring['"]/);
    assert.match(headerSource, /stiffness:\s*300/);
    assert.match(headerSource, /damping:\s*24/);
    assert.match(headerSource, /mass:\s*0\.8/);
  });

  await t.test('T1.2.7: Layout Header 100% Ant Design elimination and Glassmorphism styling', () => {
    // Assert zero antd or @ant-design/icons imports in layout Header & OpenWorkHeader
    assert.doesNotMatch(layoutHeaderSource, /from\s+['"]antd['"]/);
    assert.doesNotMatch(layoutHeaderSource, /from\s+['"]@ant-design\/icons['"]/);
    assert.doesNotMatch(openworkHeaderSource, /from\s+['"]antd['"]/);
    assert.doesNotMatch(openworkHeaderSource, /from\s+['"]@ant-design\/icons['"]/);
    
    assert.match(layoutHeaderSource, /backdrop-blur-md/);
    assert.match(layoutHeaderSource, /sticky top-0/);
    assert.match(openworkHeaderSource, /backdrop-blur-md/);
  });

  await t.test('T1.2.8: Model Selector badge pill with live pulsing dot and model search dropdown', () => {
    const modelSelectorSource = fs.readFileSync(path.join(ROOT, 'components/layout/header/ModelSelector.tsx'), 'utf8');
    assert.match(modelSelectorSource, /model-selector-pill/);
    assert.match(modelSelectorSource, /model-status-pulse/);
    assert.match(modelSelectorSource, /model-status-pulse-ring/);
    assert.match(modelSelectorSource, /model-status-pulse-dot/);
    assert.match(modelSelectorSource, /searchQuery/);
    assert.match(modelSelectorSource, /filteredModels/);
    assert.match(modelSelectorSource, /DropdownMenu/);
    // Zero Ant Design in ModelSelector
    assert.doesNotMatch(modelSelectorSource, /from\s+['"]antd['"]/);
  });

  await t.test('T1.2.9: Session title with inline editing and breadcrumbs integration', () => {
    const sessionTitleSource = fs.readFileSync(path.join(ROOT, 'components/layout/header/SessionTitle.tsx'), 'utf8');
    const breadcrumbsSource = fs.readFileSync(path.join(ROOT, 'components/layout/header/HeaderBreadcrumbs.tsx'), 'utf8');
    assert.match(sessionTitleSource, /isEditing/);
    assert.match(sessionTitleSource, /onTitleChange/);
    assert.match(sessionTitleSource, /handleSave/);
    assert.match(sessionTitleSource, /session-title-input/);
    assert.match(breadcrumbsSource, /ChevronRight/);
    assert.match(breadcrumbsSource, /Breadcrumb/);
  });

  await t.test('T1.2.10: Quick context controls (Clear chat dialog, Export, Share, Workspace toggle)', () => {
    const contextControlsSource = fs.readFileSync(path.join(ROOT, 'components/layout/header/ContextControls.tsx'), 'utf8');
    assert.match(contextControlsSource, /AlertDialog/);
    assert.match(contextControlsSource, /onClearChat/);
    assert.match(contextControlsSource, /onExport/);
    assert.match(contextControlsSource, /copy\(window\.location\.href\)/);
    assert.match(contextControlsSource, /onToggleWorkspace/);
    assert.match(contextControlsSource, /toast\.success/);
    // Zero Ant Design in ContextControls
    assert.doesNotMatch(contextControlsSource, /from\s+['"]antd['"]/);
  });
});
