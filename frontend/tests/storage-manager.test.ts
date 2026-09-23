/**
 * storage-manager.test.ts
 *
 * Automated verification test suite for Milestone 3 (Session Isolation & UUIDv7 Storage Partitioning).
 * Tests:
 * 1. RFC 9562 UUIDv7 specification conformance.
 * 2. Hierarchical storage key generation (`openwork:v7:{tenant}:{user}:{session}:{type}`).
 * 3. Multi-tenant and multi-user boundary isolation.
 * 4. Zero-residual session purging (`purgeSession`).
 * 5. Multi-session cleanup (`purgeAllUserSessions`).
 * 6. Backward-compatibility migration from legacy keys.
 */

import {
  generateUUIDv7,
  isValidUUIDv7,
  extractUUIDv7Timestamp,
  buildStorageKey,
  parseStorageKey,
  StorageManager,
  storageManager,
  getPartitionedItem,
  setPartitionedItem,
  purgeSession,
  purgeAllUserSessions,
  migrateLegacyKeys,
  GLOBAL_SESSION_ID,
} from '../lib/security/storage-manager.ts';

// Mock browser localStorage for node environment
class MockLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Attach mock localStorage to global if running in Node
if (typeof window === 'undefined') {
  const mockStorage = new MockLocalStorage();
  (global as any).window = {
    localStorage: mockStorage,
  };
  (global as any).localStorage = mockStorage;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  MILESTONE 3: STORAGE MANAGER & UUIDv7 VERIFICATION');
  console.log('======================================================\n');

  // Test 1: UUIDv7 RFC 9562 Compliance
  console.log('Tier 1: UUIDv7 RFC 9562 Conformance');
  {
    const id1 = generateUUIDv7();
    const id2 = generateUUIDv7();

    assert(isValidUUIDv7(id1), 'UUIDv7 valid format matches regex', id1);
    assert(isValidUUIDv7(id2), 'Second UUIDv7 valid format matches regex', id2);
    assert(id1 !== id2, 'Sequential UUIDv7 values are unique');

    // Check version 7 nibble
    const verDigit = id1.charAt(14);
    assert(verDigit === '7', `UUIDv7 version nibble is '7' (got '${verDigit}')`);

    // Check variant nibble (8, 9, a, or b)
    const varDigit = id1.charAt(19).toLowerCase();
    assert(['8', '9', 'a', 'b'].includes(varDigit), `UUIDv7 variant nibble is RFC compliant (got '${varDigit}')`);

    // Check timestamp extraction
    const now = Date.now();
    const customTime = now - 50000;
    const pastId = generateUUIDv7(customTime);
    const extracted = extractUUIDv7Timestamp(pastId);
    assert(
      extracted !== null && Math.abs(extracted - customTime) <= 5,
      `Extracted timestamp matches input (${extracted} ~= ${customTime})`
    );

    // Rejection of invalid UUIDs
    assert(!isValidUUIDv7('not-a-uuid'), 'Invalid string rejected by isValidUUIDv7');
    assert(!isValidUUIDv7('00000000-0000-4000-8000-000000000000'), 'UUIDv4 rejected as UUIDv7');
  }

  // Test 2: Storage Key Generation & Parsing
  console.log('\nTier 2: Namespaced Key Building & Parsing');
  {
    const key1 = buildStorageKey({ tenant: 'corp_a', user: 'alice', session: 'sess_123', type: 'sql-cache' });
    assert(
      key1 === 'openwork:v7:corp_a:alice:sess_123:sql-cache',
      `Key generation with object matches schema: ${key1}`
    );

    const key2 = buildStorageKey('corp_b', 'bob', 'sess_456', 'pnl-data');
    assert(
      key2 === 'openwork:v7:corp_b:bob:sess_456:pnl-data',
      `Key generation with positional arguments: ${key2}`
    );

    const parsed = parseStorageKey(key1);
    assert(
      parsed !== null &&
      parsed.tenant === 'corp_a' &&
      parsed.user === 'alice' &&
      parsed.session === 'sess_123' &&
      parsed.type === 'sql-cache',
      'parseStorageKey successfully decomposes namespace elements'
    );
  }

  // Test 3: Multi-tenant and Multi-user Partition Isolation
  console.log('\nTier 3: Multi-User & Multi-Tenant Partition Isolation');
  {
    const mgr = new StorageManager();

    // User Alice (Tenant Alpha)
    mgr.setTenant('alpha');
    mgr.setUser('alice');
    mgr.setPartitionedItem('sql-history', [{ query: 'SELECT * FROM alice_orders' }], 'session-alpha-1');

    // User Bob (Tenant Alpha)
    mgr.setUser('bob');
    const bobsViewOfAlice = mgr.getPartitionedItem('sql-history', 'session-alpha-1');
    assert(
      bobsViewOfAlice === null,
      'User Bob cannot access User Alice partition in the same tenant'
    );

    // Bob writes his own data
    mgr.setPartitionedItem('sql-history', [{ query: 'SELECT * FROM bob_salaries' }], 'session-alpha-1');
    const bobsOwnData = mgr.getPartitionedItem('sql-history', 'session-alpha-1');
    assert(
      Array.isArray(bobsOwnData) && bobsOwnData[0].query.includes('bob_salaries'),
      'User Bob can read his own partitioned data'
    );

    // Switch back to Alice
    mgr.setUser('alice');
    const alicesOwnData = mgr.getPartitionedItem('sql-history', 'session-alpha-1');
    assert(
      Array.isArray(alicesOwnData) && alicesOwnData[0].query.includes('alice_orders'),
      'Alice data remains uncorrupted and intact'
    );
  }

  // Test 4: Zero-Residual Session Purge
  console.log('\nTier 4: Zero-Residual Session Deletion Lifecycle Purge');
  {
    const mgr = new StorageManager();
    const sessionId = generateUUIDv7();

    // Populate multiple items under sessionId
    mgr.setPartitionedItem('session-data', { streamParts: ['msg1', 'msg2'], artifacts: ['art1'] }, sessionId);
    mgr.setPartitionedItem('local-messages', [{ role: 'user', content: 'hello' }], sessionId);
    mgr.setPartitionedItem('sql-cache', { query: 'SELECT pnl FROM finance' }, sessionId);

    // Also populate a legacy key
    window.localStorage.setItem(`openwork:session-data:${sessionId}`, JSON.stringify({ legacy: true }));
    window.localStorage.setItem(`openwork:local_messages:${sessionId}`, JSON.stringify(['legacy msg']));

    // Populate an unrelated session
    const otherSessionId = generateUUIDv7();
    mgr.setPartitionedItem('session-data', { streamParts: ['keep-me'] }, otherSessionId);

    // Execute purge
    const purgedCount = mgr.purgeSession(sessionId);
    assert(purgedCount >= 3, `Purged all associated session keys (count: ${purgedCount})`);

    // Verify zero leftover keys for sessionId
    const targetAfter = mgr.getPartitionedItem('session-data', sessionId);
    assert(targetAfter === null, 'Session data partition wiped');
    assert(window.localStorage.getItem(`openwork:session-data:${sessionId}`) === null, 'Legacy session-data wiped');
    assert(window.localStorage.getItem(`openwork:local_messages:${sessionId}`) === null, 'Legacy local-messages wiped');

    // Verify unrelated session is untouched
    const otherAfter = mgr.getPartitionedItem('session-data', otherSessionId);
    assert(otherAfter !== null, 'Unrelated session data preserved');
  }

  // Test 5: Purge All User Sessions
  console.log('\nTier 5: Purge All User Sessions (Scrub History, Preserve Settings)');
  {
    const mgr = new StorageManager();
    mgr.setTenant('company_x');
    mgr.setUser('analyst_1');

    // Global settings & preferences
    mgr.setPartitionedItem('settings', { theme: 'dark', model: 'deepseek-chat' }, GLOBAL_SESSION_ID);
    mgr.setPartitionedItem('ui-state', { sidebarOpen: true }, GLOBAL_SESSION_ID);

    // Active working sessions
    mgr.setPartitionedItem('session-data', { chat: 'report 1' }, 'sess-101');
    mgr.setPartitionedItem('session-data', { chat: 'report 2' }, 'sess-102');

    // Purge all sessions for analyst_1
    const count = mgr.purgeAllUserSessions('analyst_1', 'company_x');
    assert(count === 2, `Purged exactly all 2 session records for user (count: ${count})`);

    // Verify sessions are gone
    assert(mgr.getPartitionedItem('session-data', 'sess-101') === null, 'sess-101 is wiped');
    assert(mgr.getPartitionedItem('session-data', 'sess-102') === null, 'sess-102 is wiped');

    // Verify global settings remain intact
    const settings = mgr.getPartitionedItem('settings', GLOBAL_SESSION_ID);
    assert(settings !== null && settings.theme === 'dark', 'Global settings preserved after session purge');
  }

  // Test 6: Legacy Key Backward Compatibility Migration
  console.log('\nTier 6: Legacy Key Backward-Compatibility Migration');
  {
    const mgr = new StorageManager();
    const oldSessionId = '018f3a5e-9988-7abc-8def-0123456789ab';

    // Inject legacy unpartitioned keys into localStorage
    window.localStorage.setItem('openwork:sessions:v1', JSON.stringify([{ id: oldSessionId, title: 'Old Session' }]));
    window.localStorage.setItem(`openwork:session-data:${oldSessionId}`, JSON.stringify({ streamParts: ['old message'] }));

    // Read via partitioned API
    const migratedSessions = mgr.getPartitionedItem('sessions');
    assert(
      Array.isArray(migratedSessions) && migratedSessions[0].title === 'Old Session',
      'getPartitionedItem seamlessly resolves and migrates legacy sessions list'
    );

    const migratedSessionData = mgr.getPartitionedItem('session-data', oldSessionId);
    assert(
      migratedSessionData !== null && migratedSessionData.streamParts[0] === 'old message',
      'getPartitionedItem seamlessly resolves legacy session data'
    );

    // Test batch migration utility
    window.localStorage.setItem('openwork:settings:v1', JSON.stringify({ providerKind: 'agent-wrap' }));
    const migrationSummary = mgr.migrateLegacyKeys();
    assert(migrationSummary.migratedCount >= 1, `migrateLegacyKeys successfully migrated ${migrationSummary.migratedCount} legacy keys`);
  }

  console.log('\n======================================================');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
