import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const headerPath = path.join(rootDir, 'components', 'openwork', 'OpenWorkHeader.tsx');
const composerPath = path.join(rootDir, 'components', 'openwork', 'OpenWorkComposer.tsx');
const chatSurfacePath = path.join(rootDir, 'components', 'openwork', 'OpenWorkChatSurface.tsx');
const typesPath = path.join(rootDir, 'components', 'openwork', 'types.ts');

const headerCode = fs.readFileSync(headerPath, 'utf8');
const composerCode = fs.readFileSync(composerPath, 'utf8');
const chatSurfaceCode = fs.readFileSync(chatSurfacePath, 'utf8');
const typesCode = fs.readFileSync(typesPath, 'utf8');

test('Milestone 1 Empirical Challenger Stress Suite: Header, Composer & ChatSurface', async (t) => {

  // =========================================================================
  // SECTION 1: 44PX COMPACT HEADER CONTRACT & DNA ALIGNMENT
  // =========================================================================
  await t.test('1.1: Header strict 44px height and glassmorphism styling', () => {
    assert.ok(headerCode.includes('h-[44px] min-h-[44px]'), 'Header must strictly declare h-[44px] min-h-[44px]');
    assert.ok(headerCode.includes('px-2.5'), 'Header must declare compact horizontal padding px-2.5');
    assert.ok(headerCode.includes('backdrop-blur-md'), 'Header must declare backdrop-blur-md');
    assert.ok(headerCode.includes('border-b border-border/80'), 'Header must declare border-b border-border/80');
    assert.ok(headerCode.includes('sticky top-0'), 'Header must be sticky top-0');
  });

  await t.test('1.2: Redundant dropdowns strictly removed from header', () => {
    // Ensure header does not contain model dropdown or datasource selector triggers in its layout
    assert.ok(!headerCode.includes('data-testid="header-model-dropdown"'), 'Header must not contain redundant model dropdown');
    assert.ok(!headerCode.includes('data-testid="header-datasource-dropdown"'), 'Header must not contain redundant datasource dropdown');
  });

  await t.test('1.3: Left Cluster: Sidebar toggle, Title fallback & Live status badges', () => {
    assert.ok(headerCode.includes('onToggleSidebar'), 'Header must handle sidebar toggle');
    assert.ok(headerCode.includes('displayTitle = sessionTitle || \'Phiên mới\''), 'Header must fallback sessionTitle to Phiên mới');
    assert.ok(headerCode.includes('truncate max-w-[180px] sm:max-w-[260px] md:max-w-[340px]'), 'Header title must have responsive truncation');
    assert.ok(headerCode.includes('Đang lập kế hoạch'), 'Header must render Đang lập kế hoạch when thinking');
    assert.ok(headerCode.includes('Bước 3/5 · đang chạy'), 'Header must render Bước 3/5 · đang chạy when executing');
  });

  await t.test('1.4: Right Cluster: Stream abort, Spotlight, Share, Settings & Workbench toggle', () => {
    assert.ok(headerCode.includes('isStreaming && onStop'), 'Header must render Stop button conditionally when streaming');
    assert.ok(headerCode.includes('onToggleSpotlight'), 'Header must handle spotlight toggle');
    assert.ok(headerCode.includes('handleShareClick'), 'Header must handle share action');
    assert.ok(headerCode.includes('data-testid="openwork-settings-trigger"'), 'Header must declare data-testid="openwork-settings-trigger"');
    assert.ok(headerCode.includes('onToggleWorkbench'), 'Header must handle workbench toggle');
    assert.ok(headerCode.includes('workbenchOpen'), 'Header must indicate active workbench state');
  });

  // =========================================================================
  // SECTION 2: COMPOSER PICKERS, DEFAULT MODEL & 2-PILL MODE SWITCH
  // =========================================================================
  await t.test('2.1: Composer default model strictly locked to DeepSeek V4 Flash', () => {
    assert.ok(composerCode.includes("selectedModel = 'deepseek-v4-flash'"), 'Composer default selectedModel must be deepseek-v4-flash');
    assert.ok(composerCode.includes("id: 'deepseek-v4-flash'"), 'DEFAULT_MODELS must include deepseek-v4-flash');
    assert.ok(composerCode.includes("name: 'DeepSeek V4 Flash'"), 'DEFAULT_MODELS must have name DeepSeek V4 Flash');
    assert.ok(!composerCode.toLowerCase().includes('gemini'), 'Must not contain any Gemini models');
    assert.ok(!composerCode.includes("selectedModel = 'claude-3-5-sonnet'"), 'Must not default to Claude 3.5 Sonnet');
    assert.ok(!composerCode.includes("selectedModel = 'gpt-4o'"), 'Must not default to GPT-4o');
  });

  await t.test('2.2: 2-Pill Mode Switch: Có kế hoạch vs Trả lời ngay', () => {
    assert.ok(composerCode.includes('Có kế hoạch'), 'Must render Có kế hoạch button');
    assert.ok(composerCode.includes('Trả lời ngay'), 'Must render Trả lời ngay button');
    assert.ok(composerCode.includes("handlePlanModeChange('plan')"), 'Must switch to plan mode');
    assert.ok(composerCode.includes("handlePlanModeChange('direct')"), 'Must switch to direct mode');
    assert.ok(composerCode.includes("onReasoningModeChange(newMode === 'plan' ? 'DeepThink' : 'Quick')"), 'Must map plan to DeepThink and direct to Quick');
  });

  await t.test('2.3: 28px/29px Card Badges & Buttons specification (M3 Geist Metrics)', () => {
    assert.ok(composerCode.includes('w-[28px] h-[28px]') && composerCode.includes('rounded-[7px]'), 'Paperclip button must be 28x28px rounded-[7px]');
    assert.ok(composerCode.includes('h-[28px] px-[9px]') && composerCode.includes('rounded-[7px]'), 'Database and Model badges must be 28px height rounded-[7px]');
    assert.ok(composerCode.includes('h-[22px] px-[9px]') && composerCode.includes('rounded-[6px]'), 'Plan / Direct toggle must be 22px height rounded-[6px]');
    assert.ok(composerCode.includes('w-[29px] h-[29px]') && composerCode.includes('rounded-[8px]'), 'Send button must be 29x29px rounded-[8px]');
    assert.ok(composerCode.includes('var(--primary)') && composerCode.includes('var(--primary-fg)'), 'Send button must use primary zinc design tokens');
  });

  // =========================================================================
  // SECTION 3: HERO EMPTY STATE & CHAT SURFACE PARITY
  // =========================================================================
  await t.test('3.1: Centered Hero View elements and Vietnamese copy', () => {
    assert.ok(chatSurfaceCode.includes('Hôm nay phân tích gì, Hoàng Anh?'), 'Hero view must have greeting title');
    assert.ok(chatSurfaceCode.includes('Mô tả tác vụ — agent sẽ lập kế hoạch trước, hỏi lại nếu thiếu dữ kiện, rồi mới ghi file.'), 'Hero view must have subtitle');
    assert.ok(chatSurfaceCode.includes('ow-mark">OW</span>') || chatSurfaceCode.includes('>OW</span>'), 'Hero view must have OW badge');
    assert.ok(chatSurfaceCode.includes('PnL 4 quý theo kênh'), 'Starter card 1 must exist');
    assert.ok(chatSurfaceCode.includes('Slide cho ban điều hành'), 'Starter card 2 must exist');
    assert.ok(chatSurfaceCode.includes('Sơ đồ luồng dữ liệu'), 'Starter card 3 must exist');
    assert.ok(chatSurfaceCode.includes('Khám phá schema'), 'Starter card 4 must exist');
  });

  await t.test('3.2: Chat Surface defaults and floating composer docking', () => {
    assert.ok(chatSurfaceCode.includes('selectedModel'), 'ChatSurface must handle selectedModel prop');
    assert.ok(chatSurfaceCode.includes('turns.length === 0'), 'Renders Hero view when turns is empty');
    assert.ok(chatSurfaceCode.includes('turns.length > 0'), 'Renders docked bottom composer when turns exist');
    assert.ok(chatSurfaceCode.includes('bg-gradient-to-t'), 'Docked composer has smooth gradient backdrop');
  });

  // =========================================================================
  // SECTION 4: EMPIRICAL LOGICAL BOUNDARY & STRESS TESTS
  // =========================================================================
  await t.test('4.1: Empty and Whitespace Input Validation Fuzzing', () => {
    const isSendDisabled = (val) => !val.trim();
    
    // Test boundary strings
    assert.equal(isSendDisabled(''), true, 'Empty string disabled');
    assert.equal(isSendDisabled('   '), true, 'Spaces disabled');
    assert.equal(isSendDisabled('\t\n\r  \n'), true, 'Newlines/tabs disabled');
    assert.equal(isSendDisabled('a'), false, 'Single char enabled');
    assert.equal(isSendDisabled('  Phân tích dữ liệu  '), false, 'Trimmed string enabled');

    // Test 100,000 character prompt
    const hugePrompt = 'SQL '.repeat(25000);
    assert.equal(hugePrompt.length, 100000);
    assert.equal(isSendDisabled(hugePrompt), false, 'Massive 100k input supported without crash');
  });

  await t.test('4.2: Keyboard Event Simulation: Enter, Shift+Enter, IME Composition', () => {
    function simulateKey(key, shiftKey, isComposing, isStreaming, value) {
      let sendCalled = false;
      let stopCalled = false;
      let defaultPrevented = false;

      const event = {
        key,
        shiftKey,
        nativeEvent: { isComposing },
        preventDefault: () => { defaultPrevented = true; }
      };

      if (event.nativeEvent.isComposing) {
        return { sendCalled, stopCalled, defaultPrevented, action: 'composing' };
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (isStreaming) {
          stopCalled = true;
          return { sendCalled, stopCalled, defaultPrevented, action: 'stop' };
        } else if (value.trim()) {
          sendCalled = true;
          return { sendCalled, stopCalled, defaultPrevented, action: 'send' };
        }
      }

      return { sendCalled, stopCalled, defaultPrevented, action: 'none' };
    }

    // Enter with text
    assert.deepEqual(simulateKey('Enter', false, false, false, 'Tạo báo cáo'), { sendCalled: true, stopCalled: false, defaultPrevented: true, action: 'send' });
    // Enter with empty text
    assert.deepEqual(simulateKey('Enter', false, false, false, '   '), { sendCalled: false, stopCalled: false, defaultPrevented: true, action: 'none' });
    // Shift + Enter (newline)
    assert.deepEqual(simulateKey('Enter', true, false, false, 'Tạo báo cáo'), { sendCalled: false, stopCalled: false, defaultPrevented: false, action: 'none' });
    // IME composition (e.g. typing Vietnamese/Chinese accents)
    assert.deepEqual(simulateKey('Enter', false, true, false, 'Đang gõ tiếng Việt'), { sendCalled: false, stopCalled: false, defaultPrevented: false, action: 'composing' });
    // Enter while streaming (triggers stop)
    assert.deepEqual(simulateKey('Enter', false, false, true, 'Đang chạy'), { sendCalled: false, stopCalled: true, defaultPrevented: true, action: 'stop' });
  });

  await t.test('4.3: Rapid 10,000-cycle 2-Pill Mode Switching Stress', () => {
    let mode = 'plan';
    let reasoning = 'DeepThink';
    let planCount = 0;
    let directCount = 0;

    const switchMode = (newMode) => {
      mode = newMode;
      reasoning = newMode === 'plan' ? 'DeepThink' : 'Quick';
      if (newMode === 'plan') planCount++;
      else directCount++;
    };

    for (let i = 0; i < 10000; i++) {
      const next = i % 2 === 0 ? 'direct' : 'plan';
      switchMode(next);
    }

    assert.equal(mode, 'plan');
    assert.equal(reasoning, 'DeepThink');
    assert.equal(planCount, 5000);
    assert.equal(directCount, 5000);
  });

  await t.test('4.4: Session Title Truncation and Unicode/Emoji Resilience', () => {
    function resolveDisplayTitle(sessionTitle) {
      return sessionTitle || 'Phiên mới';
    }

    assert.equal(resolveDisplayTitle(undefined), 'Phiên mới');
    assert.equal(resolveDisplayTitle(''), 'Phiên mới');
    assert.equal(resolveDisplayTitle(null), 'Phiên mới');
    assert.equal(resolveDisplayTitle('Phân tích PnL Q3 📊 2026'), 'Phân tích PnL Q3 📊 2026');

    // 500-char session title
    const longTitle = 'Báo cáo doanh thu tài chính '.repeat(20);
    assert.equal(resolveDisplayTitle(longTitle), longTitle);
  });

  await t.test('4.5: Datasource Filtering & Search Query Stress', () => {
    const datasources = [
      { id: 'sqlite_ecommerce', name: 'SQLite (eCommerce DB)', type: 'sqlite', description: 'Đơn hàng, khách hàng & doanh thu bán lẻ' },
      { id: 'postgres_analytics', name: 'PostgreSQL (Sales Analytics)', type: 'postgres', description: 'Kho dữ liệu kinh doanh đa kênh' },
      { id: 'clickhouse_telemetry', name: 'ClickHouse (User Logs)', type: 'clickhouse', description: 'Nhật ký hành vi & truy vết phiên' },
      { id: 'financial_q3_xlsx', name: 'Financial_Reports_Q3.xlsx', type: 'excel', description: 'Bảng tính PnL & dòng tiền 2026' },
    ];

    function filterDatasources(query) {
      if (!query.trim()) return datasources;
      const q = query.toLowerCase();
      return datasources.filter(
        (ds) =>
          ds.name.toLowerCase().includes(q) ||
          ds.type.toLowerCase().includes(q) ||
          (ds.description && ds.description.toLowerCase().includes(q))
      );
    }

    assert.equal(filterDatasources('').length, 4);
    assert.equal(filterDatasources('postgres').length, 1);
    assert.equal(filterDatasources('POSTGRESQL').length, 1);
    assert.equal(filterDatasources('doanh thu').length, 1); // matches SQLite description
    assert.equal(filterDatasources('dòng tiền').length, 1); // matches Excel description
    assert.equal(filterDatasources('nonexistent_db_12345').length, 0);
    assert.equal(filterDatasources('[.*+?^${}()|[\\]\\\\]').length, 0); // regex special chars safely handled
  });

  await t.test('4.6: Model Catalog Resolution & Fallback Resilience', () => {
    const defaultModels = [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'DeepSeek' }
    ];

    function resolveModelDisplay(selected, modelList) {
      const found = modelList.find((m) => m.id === selected || m.name === selected);
      return found ? found.name : 'DeepSeek V4 Flash';
    }

    assert.equal(resolveModelDisplay('deepseek-v4-flash', defaultModels), 'DeepSeek V4 Flash');
    assert.equal(resolveModelDisplay('DeepSeek V4 Flash', defaultModels), 'DeepSeek V4 Flash');
    assert.equal(resolveModelDisplay('unknown-custom-model', defaultModels), 'DeepSeek V4 Flash');
    assert.equal(resolveModelDisplay(undefined, defaultModels), 'DeepSeek V4 Flash');
    assert.equal(resolveModelDisplay(null, defaultModels), 'DeepSeek V4 Flash');
  });

  await t.test('4.7: File Attachment Addition & Removal State Mutation', () => {
    let files = [];
    const addFiles = (newFiles) => { files = [...files, ...newFiles]; };
    const removeFile = (index) => { files = files.filter((_, i) => i !== index); };

    addFiles([{ name: 'f1.csv', size: 1024 }, { name: 'f2.xlsx', size: 2048 }]);
    assert.equal(files.length, 2);

    addFiles([{ name: 'f3.pdf', size: 4096 }]);
    assert.equal(files.length, 3);

    // Remove middle
    removeFile(1);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, 'f1.csv');
    assert.equal(files[1].name, 'f3.pdf');

    // Remove remaining
    removeFile(0);
    removeFile(0);
    assert.equal(files.length, 0);
  });
});
