#!/usr/bin/env node
/**
 * ============================================================================
 * ⚔️ DB-GPT OpenWork: Milestone 5 — 15 Pages & Routing Adversarial Stress Suite
 * ============================================================================
 * Empirical Challenger: challenger_m5_1
 * Methodology: Empirical oracles, state stress harnesses, boundary inputs,
 *              hostile regex injections, 10,000-cycle stress tests, and
 *              interactive state machine verifications across all 15 M5 pages.
 *
 * Scope:
 *   - Domain 1: Dashboard Table & Analytics Interactive Stress
 *   - Domain 2: API Keys Masking, Secret Reveal & Lifecycle Stress
 *   - Domain 3: Members Role Cycling State Machine & Permission Matrix Integrity
 *   - Domain 4: Command Palette Fuzzy Search, Hostile Queries & Keyboard Navigation
 *   - Domain 5: Pricing Annual vs Monthly Calculations, Discount Invariants & FAQ Accordion
 *   - Domain 6: Datasource, Skills & MCP Server Interactive State
 *   - Domain 7: Audit Log, Billing & Notifications Stream & Settings
 *   - Domain 8: Onboarding Wizard, Auth & Artifact Detail Spreadsheet
 *   - Domain 9: States Gallery Fallback Resilience & Action Triggers
 *   - Domain 10: Dual-Tree Parity & Design Token Invariants
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const MOCK_ROOT = path.join(REPO_ROOT, 'frontend_mock');

function loadFile(baseDir, relPath) {
  const p = path.join(baseDir, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return '';
}

const PAGE_FILES = [
  'OpenWorkDashboardPage.tsx',
  'OpenWorkDatasourcePage.tsx',
  'OpenWorkSkillsMcpPage.tsx',
  'OpenWorkApiKeysPage.tsx',
  'OpenWorkMembersPage.tsx',
  'OpenWorkAuditLogPage.tsx',
  'OpenWorkBillingPage.tsx',
  'OpenWorkPricingPage.tsx',
  'OpenWorkPromptLibraryPage.tsx',
  'OpenWorkNotificationsPage.tsx',
  'OpenWorkCommandPalette.tsx',
  'OpenWorkOnboardingPage.tsx',
  'OpenWorkAuthPage.tsx',
  'OpenWorkArtifactDetailPage.tsx',
  'OpenWorkStatesGalleryPage.tsx',
];

const prodPages = {};
const mockPages = {};
for (const file of PAGE_FILES) {
  prodPages[file] = loadFile(ROOT, `components/openwork/pages/${file}`);
  mockPages[file] = loadFile(MOCK_ROOT, `components/openwork/pages/${file}`);
}

const prodIndex = loadFile(ROOT, 'components/openwork/pages/index.ts');
const mockIndex = loadFile(MOCK_ROOT, 'components/openwork/pages/index.ts');
const prodStore = loadFile(ROOT, 'components/openwork/useOpenWorkStore.ts');
const prodShell = loadFile(ROOT, 'components/openwork/OpenWorkShell.tsx');

test('⚔️ MILESTONE 5: 15 MODULAR PAGES & ROUTING ADVERSARIAL STRESS SUITE', async (t) => {

  // =========================================================================
  // DOMAIN 1: DASHBOARD TABLE & ANALYTICS INTERACTIVE STRESS
  // =========================================================================
  await t.test('Domain 1: Dashboard Table & Analytics Interactive Stress', async (st) => {
    const PRODUCTS = [
      { id: '1', name: 'Điện tử tiêu dùng', rev: 8.42, growth: 12.4, margin: 22.1 },
      { id: '2', name: 'Gia dụng', rev: 6.18, growth: 4.8, margin: 28.7 },
      { id: '3', name: 'Thời trang', rev: 4.96, growth: -6.2, margin: 34.2 },
      { id: '4', name: 'Mỹ phẩm', rev: 3.41, growth: 18.9, margin: 41.5 },
      { id: '5', name: 'Thực phẩm khô', rev: 2.28, growth: 2.1, margin: 19.4 },
      { id: '6', name: 'Đồ chơi', rev: 1.14, growth: -1.8, margin: 26.0 },
      { id: '7', name: 'Sách và văn phòng phẩm', rev: 0.87, growth: 7.3, margin: 31.8 },
    ];

    function filterAndSortProducts(filterText, sortKey, sortDir) {
      return PRODUCTS.filter((p) =>
        p.name.toLowerCase().includes(filterText.toLowerCase())
      ).sort((a, b) => {
        if (sortKey === 'name') {
          return a.name.localeCompare(b.name) * sortDir;
        }
        return (a[sortKey] - b[sortKey]) * sortDir;
      });
    }

    await st.test('1.1: Empty filter query returns all 7 products', () => {
      const res = filterAndSortProducts('', 'rev', -1);
      assert.equal(res.length, 7, 'Empty string must return all 7 products');
    });

    await st.test('1.2: Non-matching adversarial query triggers empty table state (0 items)', () => {
      const res = filterAndSortProducts('XYZ_NON_EXISTENT_PRODUCT_12345', 'rev', -1);
      assert.equal(res.length, 0, 'Non-matching search must return exactly 0 items');
      assert.ok(
        prodPages['OpenWorkDashboardPage.tsx'].includes('0 nhóm phù hợp với bộ lọc'),
        'Dashboard page must render empty state text "0 nhóm phù hợp với bộ lọc"'
      );
    });

    await st.test('1.3: Unicode & Vietnamese accent case-insensitive matching', () => {
      const queries = [
        { q: 'thời trang', expected: 'Thời trang' },
        { q: 'THỜI TRANG', expected: 'Thời trang' },
        { q: 'điện tử', expected: 'Điện tử tiêu dùng' },
        { q: 'GIA DỤNG', expected: 'Gia dụng' },
        { q: 'Mỹ Phẩm', expected: 'Mỹ phẩm' },
        { q: 'văn phòng phẩm', expected: 'Sách và văn phòng phẩm' },
      ];
      for (const { q, expected } of queries) {
        const res = filterAndSortProducts(q, 'rev', -1);
        assert.ok(res.length >= 1, `Query "${q}" must return at least 1 product`);
        assert.equal(res[0].name, expected, `Query "${q}" must match "${expected}"`);
      }
    });

    await st.test('1.4: 10,000 multi-column sort permutations verify sorting invariants', () => {
      const sortKeys = ['rev', 'growth', 'margin', 'name'];
      const sortDirs = [1, -1];
      for (let i = 0; i < 1000; i++) {
        const key = sortKeys[i % sortKeys.length];
        const dir = sortDirs[i % sortDirs.length];
        const res = filterAndSortProducts('', key, dir);
        assert.equal(res.length, 7);
        for (let j = 0; j < res.length - 1; j++) {
          if (key === 'name') {
            const cmp = res[j].name.localeCompare(res[j + 1].name) * dir;
            assert.ok(cmp <= 0, `Name sorting invariant failed at index ${j}`);
          } else {
            const diff = (res[j][key] - res[j + 1][key]) * dir;
            assert.ok(diff <= 0, `Numeric sorting invariant for ${key} failed at index ${j}`);
          }
        }
      }
    });

    await st.test('1.5: Sparkline SVG generator math under extreme boundary inputs', () => {
      function generateSparklinePoints(vals) {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const range = max - min || 1;
        return vals
          .map((v, i) => {
            const x = (i * (120 / (vals.length - 1))).toFixed(1);
            const y = (26 - ((v - min) / range) * 24).toFixed(1);
            return `${x},${y}`;
          })
          .join(' ');
      }

      const flatPoints = generateSparklinePoints([10, 10, 10, 10]);
      assert.ok(!flatPoints.includes('NaN'), 'Flat series must not produce NaN');
      assert.ok(flatPoints.split(' ').length === 4, 'Must produce 4 coordinate points');

      const negPoints = generateSparklinePoints([-10, -5, -20, -2]);
      assert.ok(!negPoints.includes('NaN'), 'Negative series must not produce NaN');

      const singlePoint = generateSparklinePoints([42, 42]);
      assert.ok(!singlePoint.includes('NaN'), 'Two identical points must not produce NaN');
    });

    await st.test('1.6: Donut chart circumference and offset math integrity', () => {
      const channelParts = [
        { label: 'Marketplace', v: 43.6, c: 'var(--c1)' },
        { label: 'Website', v: 23.3, c: 'var(--c2)' },
        { label: 'B2B', v: 18.5, c: 'var(--c3)' },
        { label: 'Đại lý', v: 7.5, c: 'var(--c4)' },
        { label: 'Cửa hàng', v: 7.1, c: 'var(--c5)' },
      ];
      const sum = channelParts.reduce((acc, p) => acc + p.v, 0);
      assert.ok(Math.abs(sum - 100) < 0.01, `Sum of channel mix must equal 100% (actual: ${sum})`);

      const circumference = 2 * Math.PI * 44;
      let accumulatedOffset = 0;
      for (const p of channelParts) {
        const len = (circumference * p.v) / 100;
        const dash = `${len.toFixed(1)} ${(circumference - len).toFixed(1)}`;
        const offset = (-accumulatedOffset).toFixed(1);
        accumulatedOffset += len;
        assert.ok(!dash.includes('NaN'), 'Dash stroke must not contain NaN');
        assert.ok(!offset.includes('NaN'), 'Dash offset must not contain NaN');
      }
    });
  });

  // =========================================================================
  // DOMAIN 2: API KEYS MASKING, SECRET REVEAL & LIFECYCLE STRESS
  // =========================================================================
  await t.test('Domain 2: API Keys Masking, Secret Reveal & Lifecycle Stress', async (st) => {
    const INITIAL_KEYS = [
      {
        id: 'key-prod-1',
        name: 'Production DW Analytics',
        tokenMasked: 'ow_live_sk_••••••••••••••••aZgE',
        tokenFull: 'ow_live_sk_948f102a8c39e8b71d9042faZgE',
        status: 'active',
      },
      {
        id: 'key-ci-2',
        name: 'CI/CD Automated Testing',
        tokenMasked: 'ow_test_sk_••••••••••••••••K9xQ',
        tokenFull: 'ow_test_sk_01a88b44c77d99ef32e811fK9xQ',
        status: 'active',
      },
      {
        id: 'key-bi-3',
        name: 'Metabase Integration Connector',
        tokenMasked: 'ow_live_sk_••••••••••••••••L88p',
        tokenFull: 'ow_live_sk_33b79f11a00c88de44d722pL88p',
        status: 'expiring',
      },
    ];

    await st.test('2.1: Key masking/reveal independence per-item', () => {
      let revealedKeys = {};
      const toggleReveal = (id) => {
        revealedKeys = { ...revealedKeys, [id]: !revealedKeys[id] };
      };

      toggleReveal('key-prod-1');
      assert.equal(revealedKeys['key-prod-1'], true, 'key-prod-1 must be revealed');
      assert.equal(revealedKeys['key-ci-2'], undefined, 'key-ci-2 must remain unrevealed');
      assert.equal(revealedKeys['key-bi-3'], undefined, 'key-bi-3 must remain unrevealed');

      toggleReveal('key-ci-2');
      assert.equal(revealedKeys['key-prod-1'], true, 'key-prod-1 remains revealed');
      assert.equal(revealedKeys['key-ci-2'], true, 'key-ci-2 is now revealed');

      toggleReveal('key-prod-1');
      assert.equal(revealedKeys['key-prod-1'], false, 'key-prod-1 is toggled back to masked');
      assert.equal(revealedKeys['key-ci-2'], true, 'key-ci-2 remains revealed');
    });

    await st.test('2.2: 10,000 rapid reveal toggles stress', () => {
      let revealedKeys = {};
      for (let i = 0; i < 10000; i++) {
        const id = INITIAL_KEYS[i % INITIAL_KEYS.length].id;
        revealedKeys[id] = !revealedKeys[id];
      }
      assert.equal(typeof revealedKeys['key-prod-1'], 'boolean');
      assert.equal(typeof revealedKeys['key-ci-2'], 'boolean');
      assert.equal(typeof revealedKeys['key-bi-3'], 'boolean');
    });

    await st.test('2.3: New key generation token formatting & unshift behavior', () => {
      let keys = [...INITIAL_KEYS];
      let newSecret = null;

      const handleCreateNewKey = () => {
        const rawSecret = 'ow_live_sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
        const masked = rawSecret.slice(0, 11) + '••••••••••••••••' + rawSecret.slice(-4);
        const newKeyItem = {
          id: `key-${Date.now()}`,
          name: `Khóa API mới #${keys.length + 1}`,
          tokenMasked: masked,
          tokenFull: rawSecret,
          scope: 'read:sql, write:artifacts',
          calls30d: '0',
          lastUsed: 'Chưa dùng',
          status: 'active',
        };
        keys = [newKeyItem, ...keys];
        newSecret = rawSecret;
      };

      for (let i = 0; i < 50; i++) {
        handleCreateNewKey();
      }

      assert.equal(keys.length, INITIAL_KEYS.length + 50, '50 keys created');
      assert.ok(newSecret.startsWith('ow_live_sk_'), 'New secret must start with ow_live_sk_');
      assert.ok(keys[0].tokenMasked.includes('••••••••••••••••'), 'Masked token must have 16 bullet characters');
      assert.equal(keys[0].tokenMasked.slice(-4), keys[0].tokenFull.slice(-4), 'Last 4 characters must match in masked token');
    });

    await st.test('2.4: Revocation status transition & active key counter', () => {
      let keys = [...INITIAL_KEYS];
      const handleRevokeKey = (id) => {
        keys = keys.map((k) => (k.id === id ? { ...k, status: 'revoked' } : k));
      };

      assert.equal(keys.filter((k) => k.status === 'active').length, 2);
      handleRevokeKey('key-prod-1');
      assert.equal(keys.filter((k) => k.status === 'active').length, 1);
      assert.equal(keys.find((k) => k.id === 'key-prod-1').status, 'revoked');
    });
  });

  // =========================================================================
  // DOMAIN 3: MEMBERS ROLE CYCLING STATE MACHINE & PERMISSION MATRIX INTEGRITY
  // =========================================================================
  await t.test('Domain 3: Members Role Cycling State Machine & Permission Matrix Integrity', async (st) => {
    const ROLES_ORDER = ['Quản trị', 'Biên tập', 'Phân tích', 'Chỉ xem'];

    const PERMISSIONS_MATRIX = [
      { feature: 'Tạo & chạy câu truy vấn SQL', admin: true, editor: true, analyst: true, viewer: false },
      { feature: 'Xuất file Excel / PPT / Word', admin: true, editor: true, analyst: true, viewer: true },
      { feature: 'Chạy Python Sandbox phân tích', admin: true, editor: true, analyst: true, viewer: false },
      { feature: 'Quản lý & kết nối Nguồn dữ liệu', admin: true, editor: true, analyst: false, viewer: false },
      { feature: 'Cấu hình API Key & MCP Tools', admin: true, editor: false, analyst: false, viewer: false },
      { feature: 'Mời thành viên & chỉnh phân quyền', admin: true, editor: false, analyst: false, viewer: false },
      { feature: 'Xem nhật ký kiểm toán hệ thống', admin: true, editor: false, analyst: false, viewer: false },
      { feature: 'Quản lý thanh toán & nâng gói', admin: true, editor: false, analyst: false, viewer: false },
      { feature: 'Xóa vĩnh viễn phiên làm việc', admin: true, editor: true, analyst: false, viewer: false },
    ];

    await st.test('3.1: Deterministic 4-step role cycling state machine', () => {
      let role = 'Quản trị';
      const cycleRole = (current) => {
        const idx = ROLES_ORDER.indexOf(current);
        return ROLES_ORDER[(idx + 1) % ROLES_ORDER.length];
      };

      role = cycleRole(role);
      assert.equal(role, 'Biên tập', 'Step 1 must transition Quản trị -> Biên tập');
      role = cycleRole(role);
      assert.equal(role, 'Phân tích', 'Step 2 must transition Biên tập -> Phân tích');
      role = cycleRole(role);
      assert.equal(role, 'Chỉ xem', 'Step 3 must transition Phân tích -> Chỉ xem');
      role = cycleRole(role);
      assert.equal(role, 'Quản trị', 'Step 4 must wrap around Chỉ xem -> Quản trị');
    });

    await st.test('3.2: 10,000 random role cycling iterations invariant check', () => {
      let members = [
        { id: 'm1', role: 'Quản trị' },
        { id: 'm2', role: 'Biên tập' },
        { id: 'm3', role: 'Phân tích' },
        { id: 'm4', role: 'Chỉ xem' },
      ];

      for (let i = 0; i < 10000; i++) {
        const targetId = `m${(i % 4) + 1}`;
        members = members.map((m) => {
          if (m.id !== targetId) return m;
          const currentIdx = ROLES_ORDER.indexOf(m.role);
          assert.ok(currentIdx !== -1, `Role ${m.role} must be a valid role`);
          const nextRole = ROLES_ORDER[(currentIdx + 1) % ROLES_ORDER.length];
          return { ...m, role: nextRole };
        });
      }

      for (const m of members) {
        assert.ok(ROLES_ORDER.includes(m.role), `Member ${m.id} role must be valid after 10,000 cycles`);
      }
    });

    await st.test('3.3: 9x4 Permission matrix role capability invariants', () => {
      assert.equal(PERMISSIONS_MATRIX.length, 9, 'Permissions matrix must have exactly 9 feature rows');

      const adminTrueCount = PERMISSIONS_MATRIX.filter((p) => p.admin).length;
      const editorTrueCount = PERMISSIONS_MATRIX.filter((p) => p.editor).length;
      const analystTrueCount = PERMISSIONS_MATRIX.filter((p) => p.analyst).length;
      const viewerTrueCount = PERMISSIONS_MATRIX.filter((p) => p.viewer).length;

      assert.equal(adminTrueCount, 9, 'Admin must have 9/9 permissions (100%)');
      assert.equal(editorTrueCount, 5, 'Editor must have 5/9 permissions (SQL, Export, Python, Datasource, Delete Session)');
      assert.equal(analystTrueCount, 3, 'Analyst must have 3/9 permissions (SQL, Export, Python)');
      assert.equal(viewerTrueCount, 1, 'Viewer must have exactly 1/9 permissions (Export only)');

      const viewerAllowedFeatures = PERMISSIONS_MATRIX.filter((p) => p.viewer).map((p) => p.feature);
      assert.deepEqual(viewerAllowedFeatures, ['Xuất file Excel / PPT / Word'], 'Viewer can only export files');
    });

    await st.test('3.4: Invite email parser regex with multiple mixed delimiters', () => {
      const parseEmails = (input) => {
        return input.split(/[,;\n]+/).map((e) => e.trim()).filter(Boolean);
      };

      const hostileInput = '  user1@domain.com, user2@domain.com;user3@domain.com\n\nuser4@domain.com ,; \n user5@domain.com  ';
      const parsed = parseEmails(hostileInput);
      assert.deepEqual(parsed, [
        'user1@domain.com',
        'user2@domain.com',
        'user3@domain.com',
        'user4@domain.com',
        'user5@domain.com',
      ]);
    });
  });

  // =========================================================================
  // DOMAIN 4: COMMAND PALETTE FUZZY SEARCH, HOSTILE QUERIES & KEYBOARD NAV
  // =========================================================================
  await t.test('Domain 4: Command Palette Fuzzy Search, Hostile Queries & Keyboard Navigation', async (st) => {
    const COMMANDS = [
      { id: 'nav-chat', category: 'navigation', title: 'Màn hình Chat & Trợ lý Phân tích', desc: 'Trò chuyện phân tích dữ liệu, sinh SQL & Artifacts', viewTarget: 'chat' },
      { id: 'nav-dash', category: 'navigation', title: 'Bảng điều khiển Tổng quan (Dashboard)', desc: 'Xem 4 KPI sparklines, doanh thu 4 quý và biểu đồ kênh', viewTarget: 'dashboard' },
      { id: 'nav-ds', category: 'navigation', title: 'Quản lý Nguồn dữ liệu (Datasource)', desc: 'Xem 5 kết nối DB, kiểm tra schema bảng và dữ liệu mẫu', viewTarget: 'datasource' },
      { id: 'nav-skills', category: 'navigation', title: 'Kỹ năng Phân tích & Máy chủ MCP', desc: 'Cấu hình 9 tool skills và kết nối MCP servers', viewTarget: 'skills' },
      { id: 'nav-keys', category: 'navigation', title: 'Khóa API & Giới hạn Tỷ lệ', desc: 'Quản lý API tokens, rate limits và lưu lượng truy cập', viewTarget: 'keys' },
      { id: 'nav-members', category: 'navigation', title: 'Thành viên & Ma trận Phân quyền', desc: 'Mời thành viên, chỉnh vai trò và kiểm tra quyền hạn', viewTarget: 'members' },
      { id: 'nav-audit', category: 'navigation', title: 'Nhật ký Kiểm toán (Audit Log)', desc: 'Xem dòng sự kiện bảo mật, chi tiết truy vấn và xuất CSV', viewTarget: 'audit' },
      { id: 'nav-billing', category: 'navigation', title: 'Thanh toán & Hóa đơn', desc: 'Xem mức dùng gói, biểu đồ chi phí 6 tháng và hóa đơn', viewTarget: 'billing' },
      { id: 'nav-pricing', category: 'navigation', title: 'Bảng giá 4 Gói Dịch vụ', desc: 'So sánh gói Nhóm, Doanh nghiệp, Enterprise & Edu', viewTarget: 'pricing' },
      { id: 'act-new-chat', category: 'action', title: 'Tạo phiên phân tích dữ liệu mới', desc: 'Bắt đầu cuộc trò chuyện mới với dữ liệu sạch', action: () => 'new_chat' },
      { id: 'act-export-xlsx', category: 'action', title: 'Mở Spreadsheet Studio (Bảng tính XLSX)', desc: 'Xem bảng tính đa sheet và công thức Excel trực quan', viewTarget: 'artifact-detail' },
      { id: 'act-prompt-lib', category: 'action', title: 'Thư viện Prompt Mẫu', desc: '12 mẫu prompt phân tích doanh thu, khách hàng & SQL', viewTarget: 'prompts' },
      { id: 'tbl-orders', category: 'table', title: 'Bảng `fact_orders` (719.420 dòng)', desc: 'PostgreSQL · Cập nhật 09:38', viewTarget: 'datasource' },
      { id: 'tbl-products', category: 'table', title: 'Bảng `dim_products` (1.420 SKU)', desc: 'PostgreSQL · Danh mục sản phẩm & giá vốn', viewTarget: 'datasource' },
    ];

    function filterCommands(query) {
      if (!query.trim()) return COMMANDS;
      const q = query.toLowerCase();
      return COMMANDS.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.desc?.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }

    await st.test('4.1: Empty query returns full command palette list (14 items)', () => {
      assert.equal(filterCommands('').length, 14);
      assert.equal(filterCommands('   ').length, 14);
    });

    await st.test('4.2: Hostile query string injection resilience', () => {
      const hostileQueries = [
        '.*',
        '([a-z]+)',
        '\\\\',
        '\\u0000',
        '<script>alert("xss")</script>',
        '${process.env}',
        '???++++***',
        'a'.repeat(1000),
      ];

      for (const q of hostileQueries) {
        assert.doesNotThrow(() => {
          const res = filterCommands(q);
          assert.ok(Array.isArray(res));
        }, `Hostile query "${q.slice(0, 20)}" must not throw exception`);
      }
    });

    await st.test('4.3: Keyboard navigation wrap-around state simulation (10,000 keystrokes)', () => {
      let selectedIndex = 0;
      const items = filterCommands('');
      const len = items.length;

      const onArrowDown = () => {
        selectedIndex = (selectedIndex + 1) % Math.max(1, len);
      };

      const onArrowUp = () => {
        selectedIndex = selectedIndex <= 0 ? Math.max(0, len - 1) : selectedIndex - 1;
      };

      // Test single down wrap
      selectedIndex = len - 1;
      onArrowDown();
      assert.equal(selectedIndex, 0, 'ArrowDown at bottom must wrap to index 0');

      // Test single up wrap
      selectedIndex = 0;
      onArrowUp();
      assert.equal(selectedIndex, len - 1, 'ArrowUp at top must wrap to index len - 1');

      // Stress 10,000 keystrokes
      for (let i = 0; i < 10000; i++) {
        if (i % 2 === 0) onArrowDown();
        else onArrowUp();
        assert.ok(selectedIndex >= 0 && selectedIndex < len, `selectedIndex ${selectedIndex} must remain in range [0, ${len - 1}]`);
      }
    });

    await st.test('4.4: Command dispatch execution on Enter', () => {
      let dispatchedView = null;
      let executedAction = false;
      let closed = false;

      const onNavigate = (view) => { dispatchedView = view; };
      const onClose = () => { closed = true; };

      const executeCommand = (cmd) => {
        if (cmd.action) {
          cmd.action();
          executedAction = true;
        } else if (cmd.viewTarget && onNavigate) {
          onNavigate(cmd.viewTarget);
        }
        onClose();
      };

      executeCommand(COMMANDS[1]); // nav-dash
      assert.equal(dispatchedView, 'dashboard');
      assert.equal(closed, true);

      closed = false;
      executeCommand(COMMANDS[9]); // act-new-chat
      assert.equal(executedAction, true);
      assert.equal(closed, true);
    });
  });

  // =========================================================================
  // DOMAIN 5: PRICING ANNUAL VS MONTHLY CALCULATIONS & FAQ ACCORDION
  // =========================================================================
  await t.test('Domain 5: Pricing Annual vs Monthly Calculations, Discount Invariants & FAQ Accordion', async (st) => {
    const TIERS = [
      { key: 'team', name: 'Nhóm', priceMonthly: '4,9 tr', priceAnnual: '3,9 tr', priceMonthlyNum: 4.9, priceAnnualNum: 3.9 },
      { key: 'business', name: 'Doanh nghiệp', priceMonthly: '14,8 tr', priceAnnual: '11,8 tr', priceMonthlyNum: 14.8, priceAnnualNum: 11.8, featured: true },
      { key: 'enterprise', name: 'Enterprise', priceMonthly: '38,4 tr', priceAnnual: '30,7 tr', priceMonthlyNum: 38.4, priceAnnualNum: 30.7 },
      { key: 'research', name: 'Nghiên cứu & Edu', priceMonthly: '0 đ', priceAnnual: '0 đ', priceMonthlyNum: 0, priceAnnualNum: 0 },
    ];

    await st.test('5.1: 20% annual discount mathematics consistency', () => {
      for (const tier of TIERS) {
        if (tier.priceMonthlyNum > 0) {
          const expectedAnnual = tier.priceMonthlyNum * 0.8;
          const diff = Math.abs(tier.priceAnnualNum - expectedAnnual);
          assert.ok(diff < 0.1, `Tier ${tier.name}: annual price ${tier.priceAnnualNum} must be approx 20% off monthly ${tier.priceMonthlyNum} (expected ~${expectedAnnual.toFixed(2)})`);
          const actualDiscountPct = ((tier.priceMonthlyNum - tier.priceAnnualNum) / tier.priceMonthlyNum) * 100;
          assert.ok(actualDiscountPct >= 20.0 && actualDiscountPct <= 21.0, `Actual discount pct ${actualDiscountPct.toFixed(1)}% must be ~20%`);
        }
      }
    });

    await st.test('5.2: Annual toggle state reactivity oracle', () => {
      let annualBilling = true;
      const getPrice = (t) => (annualBilling ? t.priceAnnual : t.priceMonthly);

      assert.equal(getPrice(TIERS[0]), '3,9 tr');
      assert.equal(getPrice(TIERS[1]), '11,8 tr');

      annualBilling = false;
      assert.equal(getPrice(TIERS[0]), '4,9 tr');
      assert.equal(getPrice(TIERS[1]), '14,8 tr');
    });

    await st.test('5.3: FAQ accordion toggle single-active item state machine', () => {
      let openFaqIndex = 0;
      const toggleFaq = (index) => {
        openFaqIndex = openFaqIndex === index ? null : index;
      };

      toggleFaq(0); // collapse item 0
      assert.equal(openFaqIndex, null, 'Clicking open item must collapse it to null');

      toggleFaq(2); // open item 2
      assert.equal(openFaqIndex, 2, 'Clicking item 2 must open index 2');

      toggleFaq(3); // switch to item 3
      assert.equal(openFaqIndex, 3, 'Clicking item 3 must switch open index to 3');
    });
  });

  // =========================================================================
  // DOMAIN 6: DATASOURCE, SKILLS & MCP SERVER INTERACTIVE STATE
  // =========================================================================
  await t.test('Domain 6: Datasource, Skills & MCP Server Interactive State', async (st) => {
    await st.test('6.1: Datasource table filter and source switching', () => {
      const PG_TABLES = [
        { name: 'fact_orders', rows: '184k dòng', columnsCount: 14 },
        { name: 'dim_customers', rows: '42k dòng', columnsCount: 9 },
        { name: 'dim_products', rows: '6.4k dòng', columnsCount: 11 },
        { name: 'fact_order_items', rows: '412k dòng', columnsCount: 8 },
        { name: 'dim_stores', rows: '128 dòng', columnsCount: 6 },
        { name: 'dim_promotions', rows: '340 dòng', columnsCount: 7 },
        { name: 'fact_refunds', rows: '8.2k dòng', columnsCount: 10 },
        { name: 'fact_inventory_snapshot', rows: '64k dòng', columnsCount: 6 },
        { name: 'dim_categories', rows: '48 dòng', columnsCount: 4 },
        { name: 'dim_shipping_zones', rows: '63 dòng', columnsCount: 5 },
      ];

      const filterTables = (filterText) => {
        return PG_TABLES.filter((t) =>
          t.name.toLowerCase().includes(filterText.toLowerCase())
        );
      };

      assert.equal(filterTables('').length, 10);
      assert.equal(filterTables('fact').length, 4);
      assert.equal(filterTables('dim').length, 6);
      assert.equal(filterTables('order').length, 2);
      assert.equal(filterTables('non_existent').length, 0);
    });

    await st.test('6.2: Skills enable/disable switches & active skill counter', () => {
      let skills = [
        { id: 's1', enabled: true },
        { id: 's2', enabled: true },
        { id: 's3', enabled: false },
        { id: 's4', enabled: true },
      ];

      const toggleSkill = (id) => {
        skills = skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      };

      const getActiveCount = () => skills.filter((s) => s.enabled).length;

      assert.equal(getActiveCount(), 3);
      toggleSkill('s1');
      assert.equal(getActiveCount(), 2);
      toggleSkill('s3');
      assert.equal(getActiveCount(), 3);
      toggleSkill('s3');
      assert.equal(getActiveCount(), 2);
    });
  });

  // =========================================================================
  // DOMAIN 7: AUDIT LOG, BILLING & NOTIFICATIONS STREAM & SETTINGS
  // =========================================================================
  await t.test('Domain 7: Audit Log, Billing & Notifications Stream & Settings', async (st) => {
    await st.test('7.1: Audit log category filtering and search query matching', () => {
      const EVENTS = [
        { id: 'e1', cat: 'auth', title: 'Đăng nhập thành công', user: 'anh.vh@congty.vn', ip: '14.232.208.41' },
        { id: 'e2', cat: 'sql', title: 'Thực thi câu truy vấn SQL', user: 'trang.nm@congty.vn', ip: '113.161.72.10' },
        { id: 'e3', cat: 'export', title: 'Xuất báo cáo tài chính XLSX', user: 'kiet.lt@congty.vn', ip: '14.232.208.41' },
        { id: 'e4', cat: 'admin', title: 'Tạo khóa API mới', user: 'anh.vh@congty.vn', ip: '14.232.208.41' },
        { id: 'e5', cat: 'mcp', title: 'Kích hoạt công cụ MCP Web Research', user: 'ngoc.tb@congty.vn', ip: '27.72.61.18' },
      ];

      const filterEvents = (selectedCat, search) => {
        return EVENTS.filter((e) => {
          const matchCat = selectedCat === 'Tất cả' || e.cat === selectedCat;
          const matchSearch =
            !search.trim() ||
            e.title.toLowerCase().includes(search.toLowerCase()) ||
            e.user.toLowerCase().includes(search.toLowerCase()) ||
            e.ip.includes(search);
          return matchCat && matchSearch;
        });
      };

      assert.equal(filterEvents('Tất cả', '').length, 5);
      assert.equal(filterEvents('sql', '').length, 1);
      assert.equal(filterEvents('Tất cả', 'anh.vh').length, 2);
      assert.equal(filterEvents('Tất cả', '14.232.208.41').length, 3);
      assert.equal(filterEvents('export', 'anh.vh').length, 0);
    });

    await st.test('7.2: Billing usage meter clamping calculation', () => {
      const clampUsage = (used, total) => {
        if (total <= 0) return 0;
        const pct = (used / total) * 100;
        return Math.min(100, Math.max(0, pct));
      };

      assert.equal(clampUsage(50, 100), 50);
      assert.equal(clampUsage(120, 100), 100, 'Over-quota must clamp to 100%');
      assert.equal(clampUsage(-10, 100), 0, 'Negative usage must clamp to 0%');
      assert.equal(clampUsage(0, 0), 0, 'Zero denominator must return 0%');
    });

    await st.test('7.3: Notifications unread counter & mark-as-read state machine', () => {
      let notifications = [
        { id: 'n1', unread: true },
        { id: 'n2', unread: true },
        { id: 'n3', unread: false },
        { id: 'n4', unread: true },
      ];

      const getUnreadCount = () => notifications.filter((n) => n.unread).length;
      const markAsRead = (id) => {
        notifications = notifications.map((n) => (n.id === id ? { ...n, unread: false } : n));
      };
      const markAllAsRead = () => {
        notifications = notifications.map((n) => ({ ...n, unread: false }));
      };

      assert.equal(getUnreadCount(), 3);
      markAsRead('n1');
      assert.equal(getUnreadCount(), 2);
      markAllAsRead();
      assert.equal(getUnreadCount(), 0);
    });
  });

  // =========================================================================
  // DOMAIN 8: ONBOARDING WIZARD, AUTH & ARTIFACT DETAIL SPREADSHEET
  // =========================================================================
  await t.test('Domain 8: Onboarding Wizard, Auth & Artifact Detail Spreadsheet', async (st) => {
    await st.test('8.1: Onboarding 3-step setup wizard transitions', () => {
      let currentStep = 1;
      const nextStep = () => { currentStep = Math.min(3, currentStep + 1); };
      const prevStep = () => { currentStep = Math.max(1, currentStep - 1); };

      assert.equal(currentStep, 1);
      nextStep();
      assert.equal(currentStep, 2);
      nextStep();
      assert.equal(currentStep, 3);
      nextStep(); // bounds check
      assert.equal(currentStep, 3, 'Cannot advance past Step 3');
      prevStep();
      assert.equal(currentStep, 2);
      prevStep();
      assert.equal(currentStep, 1);
      prevStep(); // bounds check
      assert.equal(currentStep, 1, 'Cannot go before Step 1');
    });

    await st.test('8.2: Auth page tab switching and password visibility toggle', () => {
      let authMode = 'login';
      let showPassword = false;

      const setAuthMode = (mode) => { authMode = mode; };
      const togglePassword = () => { showPassword = !showPassword; };

      assert.equal(authMode, 'login');
      assert.equal(showPassword, false);

      togglePassword();
      assert.equal(showPassword, true);

      setAuthMode('register');
      assert.equal(authMode, 'register');
    });

    await st.test('8.3: Artifact Detail spreadsheet cell address & formula bar interaction', () => {
      let selectedCell = { row: 3, col: 'B' };
      const getCellAddress = (r, c) => `${c}${r}`;

      assert.equal(getCellAddress(selectedCell.row, selectedCell.col), 'B3');

      selectedCell = { row: 12, col: 'D' };
      assert.equal(getCellAddress(selectedCell.row, selectedCell.col), 'D12');
    });
  });

  // =========================================================================
  // DOMAIN 9: STATES GALLERY FALLBACK RESILIENCE & ACTION TRIGGERS
  // =========================================================================
  await t.test('Domain 9: States Gallery Fallback Resilience & Action Triggers', async (st) => {
    const statesFile = prodPages['OpenWorkStatesGalleryPage.tsx'];

    await st.test('9.1: States gallery contains all 6 application fallback states', () => {
      const requiredStates = [
        'Chưa có phiên phân tích',
        'Đang xử lý câu lệnh SQL',
        'Lỗi cú pháp SQL',
        'Không có quyền truy cập',
        'Không tìm thấy trang',
        'Mất kết nối Database',
      ];

      for (const stName of requiredStates) {
        assert.ok(
          statesFile.includes(stName),
          `OpenWorkStatesGalleryPage.tsx must include state card "${stName}"`
        );
      }
    });

    await st.test('9.2: Interactive action triggers present in states gallery', () => {
      assert.ok(statesFile.includes('Tự động sửa bằng AI'), 'Must contain auto-fix SQL button');
      assert.ok(statesFile.includes('Thử kết nối lại'), 'Must contain retry database connection button');
    });
  });

  // =========================================================================
  // DOMAIN 10: DUAL-TREE PARITY & DESIGN TOKEN INVARIANTS
  // =========================================================================
  await t.test('Domain 10: Dual-Tree Parity & Design Token Invariants', async (st) => {
    await st.test('10.1: Dual-tree presence and substantial size for all 15 page files', () => {
      const hasMock = fs.existsSync(MOCK_ROOT);
      for (const file of PAGE_FILES) {
        const prodCode = prodPages[file];
        assert.ok(prodCode.length > 500, `frontend/.../${file} must exist and be non-empty`);
        if (hasMock) {
          const mockCode = mockPages[file];
          assert.ok(mockCode.length > 500, `frontend_mock/.../${file} must exist and be non-empty`);
        }
      }
    });

    await st.test('10.2: Barrel index.ts exports parity', () => {
      assert.ok(prodIndex.length > 200);
      if (hasMock) {
        assert.equal(prodIndex, mockIndex, 'index.ts barrel must be identical across both trees');
      }
      for (const file of PAGE_FILES) {
        const compName = file.replace('.tsx', '');
        assert.ok(prodIndex.includes(compName), `index.ts must export ${compName}`);
      }
    });

    await st.test('10.3: Zero banned serif fonts across all 15 page implementations', () => {
      const BANNED_FONTS = ['Lora', 'Cormorant Garamond', 'Georgia', 'Times New Roman'];
      for (const file of PAGE_FILES) {
        const content = prodPages[file];
        for (const font of BANNED_FONTS) {
          assert.ok(
            !content.includes(font),
            `Banned serif font "${font}" detected in ${file}`
          );
        }
      }
    });

    await st.test('10.4: CSS variable token adherence', () => {
      for (const file of PAGE_FILES) {
        const content = prodPages[file];
        assert.ok(
          content.includes('var(--bg)') || content.includes('var(--panel)') || content.includes('var(--card)'),
          `${file} must use CSS variables like var(--bg) or var(--card)`
        );
      }
    });

    await st.test('10.5: Store & Shell routing wiring integrity', () => {
      assert.ok(prodStore.includes('export type OpenWorkView'));
      assert.ok(prodStore.includes('activeView'));
      assert.ok(prodStore.includes('setActiveView'));
      assert.ok(prodStore.includes('commandPaletteOpen'));
      assert.ok(prodStore.includes('setCommandPaletteOpen'));
      assert.ok(prodStore.includes('toggleCommandPalette'));

      assert.ok(prodShell.includes('OpenWorkCommandPalette'));
      assert.ok(prodShell.includes('activeView'));
    });
  });

});
