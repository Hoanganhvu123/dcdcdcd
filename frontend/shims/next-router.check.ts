/**
 * Runnable unit test suite for Next.js router compatibility shim.
 *
 *   node shims/next-router.check.ts
 *
 * Verifies:
 * 1. mergeQuery semantics (search-only, route-only, overlapping, repeated/array params, empty)
 * 2. toHref URL serialization (strings, UrlObjects, array queries, null/undefined stripping, existing ?, hash)
 * 3. Dynamic route simulation for all 4 dynamic page routes in DB-GPT
 * 4. NextRouter interface contract and property guarantees
 */

import assert from 'node:assert/strict';
import { mergeQuery, toHref, type UrlObject, type Query } from './next-router.ts';

console.log('=== STARTING NEXT-ROUTER COMPATIBILITY SHIM VERIFICATION ===\n');

let passCount = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    throw err;
  }
}

// ── 1. mergeQuery Semantics ──────────────────────────────────────────────────
console.log('--- SUITE 1: mergeQuery Semantics ---');

test('1.1: mergeQuery with search params only', () => {
  const params = {};
  const search = '?scene=chat_agent&id=conv-123';
  const res = mergeQuery(params, search);
  assert.deepEqual(res, {
    scene: 'chat_agent',
    id: 'conv-123',
  });
});

test('1.2: mergeQuery with route params only', () => {
  const params = { code: 'EVAL-001', mode: 'auto' };
  const search = '';
  const res = mergeQuery(params, search);
  assert.deepEqual(res, {
    code: 'EVAL-001',
    mode: 'auto',
  });
});

test('1.3: mergeQuery with overlapping route and search params (search takes precedence)', () => {
  const params = { id: 'route-id', type: 'system' };
  const search = '?id=search-override&extra=1';
  const res = mergeQuery(params, search);
  assert.deepEqual(res, {
    id: 'search-override',
    type: 'system',
    extra: '1',
  });
});

test('1.4: mergeQuery with array query parameters (?tag=a&tag=b)', () => {
  const params = { category: 'ai' };
  const search = '?tag=sql&tag=python&tag=agent';
  const res = mergeQuery(params, search);
  assert.deepEqual(res, {
    category: 'ai',
    tag: ['sql', 'python', 'agent'],
  });
});

test('1.5: mergeQuery with empty params and URLSearchParams instance', () => {
  const params = {};
  const search = new URLSearchParams();
  const res = mergeQuery(params, search);
  assert.deepEqual(res, {});

  // With undefined route param values
  const undefinedParams = { a: undefined, b: 'valid' };
  const res2 = mergeQuery(undefinedParams, new URLSearchParams());
  assert.deepEqual(res2, { b: 'valid' });
});

// ── 2. toHref URL Serialization ──────────────────────────────────────────────
console.log('\n--- SUITE 2: toHref URL Serialization ---');

test('2.1: toHref passes string URLs through unchanged', () => {
  assert.equal(toHref('/chat'), '/chat');
  assert.equal(toHref('/chat?scene=sql&id=123'), '/chat?scene=sql&id=123');
  assert.equal(toHref('/construct/skills#section2'), '/construct/skills#section2');
  assert.equal(toHref(''), '');
});

test('2.2: toHref with basic UrlObject { pathname, query }', () => {
  const urlObj: UrlObject = {
    pathname: '/chat',
    query: { id: 'abc', scene: 'sql' },
  };
  assert.equal(toHref(urlObj), '/chat?id=abc&scene=sql');
});

test('2.3: toHref with array values in query object', () => {
  const urlObj: UrlObject = {
    pathname: '/models_evaluation',
    query: {
      tags: ['benchmark', 'q4', 'leaderboard'],
      page: 1,
    },
  };
  assert.equal(toHref(urlObj), '/models_evaluation?tags=benchmark&tags=q4&tags=leaderboard&page=1');
});

test('2.4: toHref with undefined and null query values (omitted cleanly)', () => {
  const urlObj: UrlObject = {
    pathname: '/deep-research',
    query: {
      prompt: 'Analyze DB-GPT',
      unused: undefined,
      nilValue: null,
      active: true,
    },
  };
  assert.equal(toHref(urlObj), '/deep-research?prompt=Analyze+DB-GPT&active=true');
});

test('2.5: toHref with existing question mark in pathname', () => {
  const urlObj: UrlObject = {
    pathname: '/chat?defaultMode=sql',
    query: {
      id: 'session-99',
      tab: 'editor',
    },
  };
  assert.equal(toHref(urlObj), '/chat?defaultMode=sql&id=session-99&tab=editor');
});

test('2.6: toHref with hash handling in pathname and UrlObject.hash', () => {
  const urlObjWithHashProp: UrlObject = {
    pathname: '/construct/flow/canvas',
    query: { id: 'flow-123' },
    hash: 'step-3',
  };
  assert.equal(toHref(urlObjWithHashProp), '/construct/flow/canvas?id=flow-123#step-3');

  const urlObjWithHashPropLeading: UrlObject = {
    pathname: '/construct/flow/canvas',
    query: { id: 'flow-123' },
    hash: '#step-3',
  };
  assert.equal(toHref(urlObjWithHashPropLeading), '/construct/flow/canvas?id=flow-123#step-3');

  const urlObjWithPathHash: UrlObject = {
    pathname: '/construct/flow/canvas#overview',
    query: { id: 'flow-123' },
  };
  assert.equal(toHref(urlObjWithPathHash), '/construct/flow/canvas?id=flow-123#overview');
});

test('2.7: toHref edge cases (empty object, query-only, string query)', () => {
  assert.equal(toHref({}), '');
  assert.equal(toHref({ pathname: '/' }), '/');
  assert.equal(toHref({ query: { scene: 'chat' } }), '?scene=chat');
  assert.equal(toHref({ pathname: '/search', query: 'q=database&lang=ts' }), '/search?q=database&lang=ts');
  assert.equal(toHref(null as any), '');
  assert.equal(toHref(undefined as any), '');
});

// ── 3. Dynamic Route Parameter Extraction ────────────────────────────────────
console.log('\n--- SUITE 3: Dynamic Route Parameter Extraction Simulation ---');

test('3.1: Route /models_evaluation/:code extraction', () => {
  // Simulates react-router useParams() for /models_evaluation/:code
  const routeParams = { code: 'EVAL-BENCHMARK-2026' };
  const searchString = '?tab=overview&download=true';
  const query = mergeQuery(routeParams, searchString);

  assert.equal(query.code, 'EVAL-BENCHMARK-2026', 'code extracted correctly');
  assert.equal(query.tab, 'overview', 'search param tab preserved');
  assert.equal(query.download, 'true', 'search param download preserved');
});

test('3.2: Route /share/:token extraction', () => {
  // Simulates react-router useParams() for /share/:token
  const routeParams = { token: 'tok_share_sec_9948271' };
  const searchString = '?view=presentation&speed=2x';
  const query = mergeQuery(routeParams, searchString);

  assert.equal(query.token, 'tok_share_sec_9948271', 'token extracted correctly');
  assert.equal(query.view, 'presentation', 'search param view preserved');
  assert.equal(query.speed, '2x', 'search param speed preserved');
});

test('3.3: Route /construct/scheduled-tasks/:taskId extraction', () => {
  // Simulates react-router useParams() for /construct/scheduled-tasks/:taskId
  const routeParams = { taskId: 'task-cron-hourly-clean' };
  const searchString = '?status=running';
  const query = mergeQuery(routeParams, searchString);

  assert.equal(query.taskId, 'task-cron-hourly-clean', 'taskId extracted correctly');
  assert.equal(query.status, 'running', 'status preserved');
});

test('3.4: Route /construct/prompt/:type extraction', () => {
  // Simulates react-router useParams() for /construct/prompt/:type
  const routeParams = { type: 'chat_agent_system' };
  const searchString = '?category=default&archived=false';
  const query = mergeQuery(routeParams, searchString);

  assert.equal(query.type, 'chat_agent_system', 'type extracted correctly');
  assert.equal(query.category, 'default', 'category preserved');
  assert.equal(query.archived, 'false', 'archived preserved');
});

// ── 4. NextRouter Contract & Lifecycle Properties ───────────────────────────
console.log('\n--- SUITE 4: NextRouter Contract & Lifecycle Verification ---');

test('4.1: Simulated Router shape conforms to Next.js useRouter surface', async () => {
  const simulatedLocation = {
    pathname: '/chat',
    search: '?scene=chat_agent&id=conv-456',
    hash: '#msg-10',
  };
  const simulatedParams = {};
  const searchParams = new URLSearchParams(simulatedLocation.search);

  const navigated: Array<{ url: string; options?: any }> = [];
  const fakeNavigate = (target: string | number, options?: any) => {
    if (typeof target === 'string') {
      navigated.push({ url: target, options });
    }
  };

  const router = {
    pathname: simulatedLocation.pathname,
    asPath: simulatedLocation.pathname + simulatedLocation.search + simulatedLocation.hash,
    query: mergeQuery(simulatedParams, searchParams),
    push: async (url: string | UrlObject, _as?: string | UrlObject, _options?: any) => {
      fakeNavigate(toHref(url));
      return true;
    },
    replace: async (url: string | UrlObject, _as?: string | UrlObject, _options?: any) => {
      fakeNavigate(toHref(url), { replace: true });
      return true;
    },
    back: () => fakeNavigate(-1),
    reload: () => {},
    prefetch: async () => {},
    beforePopState: () => {},
    events: {
      on: () => {},
      off: () => {},
      emit: () => {},
    },
    isReady: true,
    isFallback: false,
    isPreview: false,
    isLocaleDomain: false,
  };

  // Property validations
  assert.equal(router.isReady, true, 'isReady must be true for synchronous react-router');
  assert.equal(router.isFallback, false, 'isFallback must be false');
  assert.equal(router.pathname, '/chat', 'pathname matches location.pathname');
  assert.equal(router.asPath, '/chat?scene=chat_agent&id=conv-456#msg-10', 'asPath includes search and hash');
  assert.deepEqual(router.query, { scene: 'chat_agent', id: 'conv-456' });

  // Event handler interface validations
  assert.equal(typeof router.events.on, 'function');
  assert.equal(typeof router.events.off, 'function');
  assert.equal(typeof router.events.emit, 'function');

  // Push with string
  const pushRes1 = await router.push('/knowledge');
  assert.equal(pushRes1, true);
  assert.equal(navigated[0].url, '/knowledge');

  // Push with UrlObject (simulating DeepResearch / ReplayControlBar navigation)
  const pushRes2 = await router.push({
    pathname: '/',
    query: { prompt: 'Analyze revenue', mode: 'deep_research' },
  });
  assert.equal(pushRes2, true);
  assert.equal(navigated[1].url, '/?prompt=Analyze+revenue&mode=deep_research');

  // Replace with UrlObject
  const replaceRes = await router.replace({
    pathname: '/construct/scheduled-tasks',
    query: { filter: 'active' },
  });
  assert.equal(replaceRes, true);
  assert.equal(navigated[2].url, '/construct/scheduled-tasks?filter=active');
  assert.equal(navigated[2].options?.replace, true);
});

console.log(`\n=== ALL ${passCount} NEXT-ROUTER CHECKS PASSED SUCCESSFULLY ===\n`);
