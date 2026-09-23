/**
 * Adversarial Challenger Stress-Test Suite for NextRouter Compatibility Shim & Dynamic Routes
 */

import assert from 'node:assert/strict';
import { mergeQuery, toHref, type UrlObject, type Query } from './next-router.ts';

console.log('=== RUNNING ADVERSARIAL CHALLENGER TESTS FOR M4 ===\n');

let passCount = 0;
let failCount = 0;

function challenge(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log('  [PASS] ' + name);
  } catch (err: any) {
    failCount++;
    console.error('  [FAIL] ' + name + ':', err?.message || err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. toHref Adversarial Stress Cases
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: toHref Adversarial Stress Cases ---');

challenge('1.1: Falsy, null, undefined, primitive inputs to toHref', () => {
  assert.equal(toHref(null as any), '');
  assert.equal(toHref(undefined as any), '');
  assert.equal(toHref(0 as any), '');
  assert.equal(toHref(false as any), '');
  assert.equal(toHref({} as any), '');
});

challenge('1.2: Numeric values (0, negative, floats) and booleans (false, true)', () => {
  const urlObj: UrlObject = {
    pathname: '/api/test',
    query: {
      count: 0,
      neg: -42,
      pi: 3.1415,
      enabled: false,
      visible: true,
    },
  };
  const res = toHref(urlObj);
  const parsed = new URL(res, 'http://localhost');
  assert.equal(parsed.pathname, '/api/test');
  assert.equal(parsed.searchParams.get('count'), '0');
  assert.equal(parsed.searchParams.get('neg'), '-42');
  assert.equal(parsed.searchParams.get('pi'), '3.1415');
  assert.equal(parsed.searchParams.get('enabled'), 'false');
  assert.equal(parsed.searchParams.get('visible'), 'true');
});

challenge('1.3: Arrays with undefined, null, and empty items', () => {
  const urlObj: UrlObject = {
    pathname: '/filter',
    query: {
      items: ['alpha', undefined, null, 'beta', 0, false, ''],
      emptyArr: [],
    },
  };
  const res = toHref(urlObj);
  const parsed = new URL(res, 'http://localhost');
  assert.deepEqual(parsed.searchParams.getAll('items'), ['alpha', 'beta', '0', 'false', '']);
  assert.equal(parsed.searchParams.has('emptyArr'), false);
});

challenge('1.4: Special characters, Unicode, and spaces in query keys and values', () => {
  const urlObj: UrlObject = {
    pathname: '/search',
    query: {
      'c++ question': 'std::vector<int>',
      'prompt': '你好 世界 🚀',
      'formula': 'a & b = c + d',
    },
  };
  const res = toHref(urlObj);
  const parsed = new URL(res, 'http://localhost');
  assert.equal(parsed.searchParams.get('c++ question'), 'std::vector<int>');
  assert.equal(parsed.searchParams.get('prompt'), '你好 世界 🚀');
  assert.equal(parsed.searchParams.get('formula'), 'a & b = c + d');
});

challenge('1.5: Multi-layer query precedence (pathname query + url.search + url.query object)', () => {
  const urlObj: UrlObject = {
    pathname: '/chat?init=1&overrideMe=pathVal',
    search: '?searchParam=2&overrideMe=searchVal',
    query: {
      overrideMe: 'finalQueryVal',
      extra: 'extraVal',
    },
  };
  const res = toHref(urlObj);
  const parsed = new URL(res, 'http://localhost');
  assert.equal(parsed.pathname, '/chat');
  assert.equal(parsed.searchParams.get('init'), '1');
  assert.equal(parsed.searchParams.get('searchParam'), '2');
  assert.equal(parsed.searchParams.get('overrideMe'), 'finalQueryVal', 'object query takes highest precedence');
  assert.equal(parsed.searchParams.get('extra'), 'extraVal');
});

challenge('1.6: Complex hash resolution (path hash vs explicit hash property)', () => {
  // Case A: hash on pathname only
  assert.equal(toHref({ pathname: '/page#sec1' }), '/page#sec1');

  // Case B: hash on object property with leading #
  assert.equal(toHref({ pathname: '/page', hash: '#sec2' }), '/page#sec2');

  // Case C: hash on object property without leading #
  assert.equal(toHref({ pathname: '/page', hash: 'sec3' }), '/page#sec3');

  // Case D: explicit hash overrides pathname hash
  assert.equal(toHref({ pathname: '/page#secOld', hash: '#secNew' }), '/page#secNew');

  // Case E: hash with query string
  assert.equal(toHref({ pathname: '/page?a=1#secOld', hash: 'secNew', query: { b: '2' } }), '/page?a=1&b=2#secNew');
});

challenge('1.7: High throughput query generation (1,000 keys)', () => {
  const bigQuery: Record<string, any> = {};
  for (let i = 0; i < 1000; i++) {
    bigQuery['k_' + i] = 'v_' + i;
  }
  const start = performance.now();
  const res = toHref({ pathname: '/benchmark', query: bigQuery });
  const duration = performance.now() - start;
  assert.ok(res.startsWith('/benchmark?k_0=v_0'));
  assert.ok(res.includes('k_999=v_999'));
  assert.ok(duration < 100, 'Large query serialization must be <100ms, took ' + duration.toFixed(2) + 'ms');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. mergeQuery Adversarial Stress Cases
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: mergeQuery Adversarial Stress Cases ---');

challenge('2.1: Leading ?, missing ?, empty search strings', () => {
  assert.deepEqual(mergeQuery({}, '?a=1&b=2'), { a: '1', b: '2' });
  assert.deepEqual(mergeQuery({}, 'a=1&b=2'), { a: '1', b: '2' });
  assert.deepEqual(mergeQuery({}, ''), {});
  assert.deepEqual(mergeQuery({}, '?'), {});
});

challenge('2.2: Array param expansion vs single param extraction', () => {
  // 3 items -> array
  const q1 = mergeQuery({}, '?tag=react&tag=vite&tag=next');
  assert.deepEqual(q1.tag, ['react', 'vite', 'next']);

  // 1 item -> string
  const q2 = mergeQuery({}, '?tag=react');
  assert.equal(q2.tag, 'react');

  // 2 items -> array
  const q3 = mergeQuery({}, '?tag=react&tag=vite');
  assert.deepEqual(q3.tag, ['react', 'vite']);
});

challenge('2.3: Route params with undefined/null stripped, valid retained', () => {
  const routeParams: Record<string, string | undefined> = {
    taskId: 'task-999',
    opt1: undefined,
    opt2: undefined,
    realParam: 'val-real',
  };
  const res = mergeQuery(routeParams, '?extra=ok');
  assert.deepEqual(res, {
    taskId: 'task-999',
    realParam: 'val-real',
    extra: 'ok',
  });
  assert.equal('opt1' in res, false);
  assert.equal('opt2' in res, false);
});

challenge('2.4: Search params override route params with array and single value', () => {
  const routeParams = { code: 'BASE_ROUTE_CODE', category: 'agent' };
  
  // Single override
  const res1 = mergeQuery(routeParams, '?code=SEARCH_OVERRIDE');
  assert.equal(res1.code, 'SEARCH_OVERRIDE');
  assert.equal(res1.category, 'agent');

  // Array override
  const res2 = mergeQuery(routeParams, '?code=O1&code=O2');
  assert.deepEqual(res2.code, ['O1', 'O2']);
  assert.equal(res2.category, 'agent');
});

challenge('2.5: URL encoded values and unicode in mergeQuery', () => {
  const search = '?query=%E4%BD%A0%E5%A5%BD&formula=1%2B1%3D2&filter=a%26b';
  const res = mergeQuery({}, search);
  assert.equal(res.query, '你好');
  assert.equal(res.formula, '1+1=2');
  assert.equal(res.filter, 'a&b');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dynamic Route Parameter Extraction & Integration Validation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Dynamic Route Parameter Mapping & Semantic Verification ---');

challenge('3.1: Route 1 - /models_evaluation/[code].tsx parameter resolution', () => {
  const codes = ['BENCH-2026-Q1', '550e8400-e29b-41d4-a716-446655440000', 'eval_model_test_01'];
  for (const c of codes) {
    const query = mergeQuery({ code: c }, '?tab=overview&page=1');
    assert.equal(query.code, c);
    assert.equal(query.tab, 'overview');
    assert.equal(query.page, '1');
  }
});

challenge('3.2: Route 2 - /share/[token].tsx parameter resolution', () => {
  const tokens = ['sh_99281a_b', 'abc123XYZ', 'tok-session-share-alpha'];
  for (const tok of tokens) {
    const query = mergeQuery({ token: tok }, '?speed=2x&autoPlay=true');
    assert.equal(query.token, tok);
    assert.equal(query.speed, '2x');
    assert.equal(query.autoPlay, 'true');
  }
});

challenge('3.3: Route 3 - /construct/scheduled-tasks/[taskId].tsx parameter resolution', () => {
  const taskIds = ['task-cron-001', '12345', 'task_daily_sync'];
  for (const tid of taskIds) {
    const query = mergeQuery({ taskId: tid }, '?action=edit');
    assert.equal(query.taskId, tid);
    assert.equal(query.action, 'edit');
  }
});

challenge('3.4: Route 4 - /construct/prompt/[type]/index.tsx parameter resolution', () => {
  const modes = ['add', 'edit'];
  for (const mode of modes) {
    const query = mergeQuery({ type: mode }, '?category=chat_agent');
    assert.equal(query.type, mode);
    assert.equal(query.category, 'chat_agent');
  }
});

console.log('\n=== ALL ' + passCount + ' ADVERSARIAL CHALLENGER TESTS PASSED (0 FAILS) ===\n');
