/**
 * adversarial-challenger-m3-m4-stress.test.mjs
 *
 * Empirical Adversarial Challenger Test Harness for:
 * - M3: Storage & RFC 9562 UUIDv7 Isolation Stress (50k tokens, multi-tenant/multi-user, clean purge)
 * - M4: RBAC Permissions Matrix & Guardrails Stress (privilege escalation, confirmation phrase evasions)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

function generateUUIDv7(customTimestamp) {
  const now = typeof customTimestamp === 'number' && !isNaN(customTimestamp)
    ? customTimestamp
    : Date.now();

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // 48-bit big-endian timestamp in milliseconds (bytes 0-5)
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(now / 0x100000000) & 0xff;
  bytes[2] = Math.floor(now / 0x1000000) & 0xff;
  bytes[3] = Math.floor(now / 0x10000) & 0xff;
  bytes[4] = Math.floor(now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7: 0111 in upper 4 bits of octet 6 (bits 48..51)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant RFC 4122/9562: 10xx in upper 2 bits of octet 8 (bits 64..65)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function isValidUUIDv7(id) {
  if (typeof id !== 'string' || id.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function extractUUIDv7Timestamp(uuid) {
  if (!isValidUUIDv7(uuid)) return null;
  const cleanHex = uuid.replace(/-/g, '').slice(0, 12);
  const timestamp = parseInt(cleanHex, 16);
  return isNaN(timestamp) ? null : timestamp;
}

const TORAGE_PREFIX = 'openwork:v7';
const DEFAULT_TENANT = 'default';
const DEFAULT_USER = 'default';
const GLOBAL_SESSION_ID = 'global';

function sanitizeNamespacePart(input) {
  if (!input) return 'default';
  return String(input).trim().replace(/[:\\s]/g, '_');
}

function buildStorageKey(arg1, arg2, arg3, arg4) {
  if (typeof arg1 === 'object' && arg1 !== null) {
    const tenant = sanitizeNamespacePart(arg1.tenant || DEFAULT_TENANT);
    const user = sanitizeNamespacePart(arg1.user || DEFAULT_USER);
    const session = sanitizeNamespacePart(arg1.session || GLOBAL_SESSION_ID);
    const type = sanitizeNamespacePart(arg1.type || 'data');
    return `${STORAGE_PREFIX}:${tenant}:${user}:${session}:${type}`;
  }
  if (typeof arg1 === 'string' && arg2 !== undefined && arg3 !== undefined && arg4 !== undefined) {
    const tenant = sanitizeNamespacePart(arg1 || DEFAULT_TENANT);
    const user = sanitizeNamespacePart(arg2 || DEFAULT_USER);
    const session = sanitizeNamespacePart(arg3 || GLOBAL_SESSION_ID);
    const type = sanitizeNamespacePart(arg4 || 'data');
    return `${STORAGE_PREFIX}:${tenant}:${user}:${session}:${type}`;
  }
  const type = sanitizeNamespacePart(typeof arg1 === 'string' ? arg1 : 'data');
  return `${STORAGE_PREFIX}:${DEFAULT_TENANT}:${DEFAULT_USER}:${GLOBAL_SESSION_ID}:${type}`;
}

function parseStorageKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length === 6 && parts[0] === 'openwork' && parts[1] === 'v7') {
    return {
      version: 'v7',
      tenant: parts[2],
      user: parts[3],
      session: parts[4],
      type: parts[5],
    };
  }
  return null;
}

class StorageManager {
  constructor(customStorage = null) {
    this.inMemoryStore = new Map();
    this.currentTenant = DEFAULT_TENANT;
    this.currentUser = DEFAULT_USER;
    this.customStorage = customStorage;
  }
  setTenant(tenant) {
    this.currentTenant = tenant ? sanitizeNamespacePart(tenant) : DEFAULT_TENANT;
  }
  getTenant() { return this.currentTenant; }
  setUser(user) {
    this.currentUser = user ? sanitizeNamespacePart(user) : DEFAULT_USER;
  }
  getUser() { return this.currentUser; }
  getStorage() {
    if (this.customStorage) return this.customStorage;
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch {}
    return null;
  }
  getItem(key, defaultValue) {
    if (!key) return defaultValue ?? null;
    let rawValue = null;
    const storage = this.getStorage();
    if (storage) {
      try { rawValue = storage.getItem(key); } catch { rawValue = this.inMemoryStore.get(key) ?? null; }
    } else {
      rawValue = this.inMemoryStore.get(key) ?? null;
    }
    if (rawValue === null || rawValue === undefined) return defaultValue ?? null;
    try { return JSON.parse(rawValue); } catch { return rawValue; }
  }
  setItem(key, value) {
    if (!key) return false;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const storage = this.getStorage();
    if (storage) {
      try {
        storage.setItem(key, serialized);
        return true;
      } catch {
        this.inMemoryStore.set(key, serialized);
        return false;
      }
    } else {
      this.inMemoryStore.set(key, serialized);
      return true;
    }
  }
  removeItem(key) {
    if (!key) return;
    const storage = this.getStorage();
    if (storage) { try { storage.removeItem(key); } catch {} }
    this.inMemoryStore.delete(key);
  }
  buildKey(type, session = GLOBAL_SESSION_ID) {
    return buildStorageKey(this.currentTenant, this.currentUser, session, type);
  }
  getPartitionedItem(typeOrOptions, sessionOrKeyOrDef, defaultValue) {
    let key;
    let effectiveDefault = null;
    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      key = buildStorageKey(typeOrOptions);
      effectiveDefault = sessionOrKeyOrDef ?? null;
    } else if (typeof typeOrOptions === 'string' && typeOrOptions.startsWith(`${STORAGE_PREFIX}:`)) {
      key = typeOrOptions;
      effectiveDefault = sessionOrKeyOrDef ?? null;
    } else {
      const type = typeOrOptions;
      const session = typeof sessionOrKeyOrDef === 'string' ? sessionOrKeyOrDef : GLOBAL_SESSION_ID;
      key = this.buildKey(type, session);
      effectiveDefault = defaultValue !== undefined ? defaultValue : (typeof sessionOrKeyOrDef !== 'string' ? sessionOrKeyOrDef : null);
    }
    const val = this.getItem(key);
    return val !== null && val !== undefined ? val : effectiveDefault;
  }
  setPartitionedItem(typeOrOptions, valueOrSession, sessionOrValue) {
    let key;
    let value;
    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      key = buildStorageKey(typeOrOptions);
      value = valueOrSession;
    } else if (typeof typeOrOptions === 'string' && typeOrOptions.startsWith(`${STORAGE_PREFIX}:`)) {
      key = typeOrOptions;
      value = valueOrSession;
    } else {
      const type = typeOrOptions;
      let session = GLOBAL_SESSION_ID;
      if (typeof sessionOrValue === 'string') {
        session = sessionOrValue;
        value = valueOrSession;
      } else if (sessionOrValue !== undefined) {
        value = sessionOrValue;
        session = typeof valueOrSession === 'string' ? valueOrSession : GLOBAL_SESSION_ID;
      } else {
        value = valueOrSession;
      }
      key = this.buildKey(type, session);
    }
    return this.setItem(key, value);
  }
  purgeSession(sessionId, user, tenant) {
    if (!sessionId || typeof sessionId !== 'string') return 0;
    const cleanId = sessionId.trim();
    if (!cleanId) return 0;
    let purgedCount = 0;
    const keysToRemove = [];
    const storage = this.getStorage();
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && this.isKeyMatchingSession(key, cleanId, user, tenant)) {
            keysToRemove.push(key);
          }
        }
      } catch {}
    }
    for (const key of this.inMemoryStore.keys()) {
      if (this.isKeyMatchingSession(key, cleanId, user, tenant)) {
        if (!keysToRemove.includes(key)) keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      this.removeItem(key);
      purgedCount++;
    }
    return purgedCount;
  }
  purgeAllUserSessions(user, tenant) {
    const targetUser = user ? sanitizeNamespacePart(user) : this.currentUser;
    const targetTenant = tenant ? sanitizeNamespacePart(tenant) : this.currentTenant;
    let purgedCount = 0;
    const keysToRemove = [];
    const storage = this.getStorage();
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;
          const parsed = parseStorageKey(key);
          if (parsed && parsed.tenant === targetTenant && parsed.user === targetUser && parsed.session !== GLOBAL_SESSION_ID) {
            keysToRemove.push(key);
          }
        }
      } catch {}
    }
    for (const key of this.inMemoryStore.keys()) {
      const parsed = parseStorageKey(key);
      if (parsed && parsed.tenant === targetTenant && parsed.user === targetUser && parsed.session !== GLOBAL_SESSION_ID) {
        if (!keysToRemove.includes(key)) keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      this.removeItem(key);
      purgedCount++;
    }
    return purgedCount;
  }
  isKeyMatchingSession(key, sessionId, userConstraint, tenantConstraint) {
    const parsed = parseStorageKey(key);
    if (parsed) {
      if (parsed.session === sessionId) {
        if (tenantConstraint && parsed.tenant !== tenantConstraint) return false;
        if (userConstraint && parsed.user !== userConstraint) return false;
        return true;
      }
      return false;
    }
    if (
      key === `openwork:session-data:${sessionId}` ||
      key === `openwork:local_messages:${sessionId}` ||
      key.startsWith(`openwork:session:${sessionId}`) ||
      key.startsWith(`openwork:local_messages:${sessionId}`) ||
      key.startsWith(`openwork:draft:${sessionId}`) ||
      key.startsWith(`openwork:pnl:${sessionId}`) ||
      key.startsWith(`openwork:sql:${sessionId}`)
    ) {
      return true;
    }
    return false;
  }
}

class MockLocalStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(index) {
    const keys = Array.from(this.map.keys());
    return keys[index] || null;
  }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const PERMISSIONS_MATRIX = {
  admin: {
    canManageMembers: true,
    canRevokeTokens: true,
    canRevokeKeys: true,
    canEditSettings: true,
    canEdit: true,
    canAdmin: true,
    canExecuteSQQ: true,
    canViewOnly: false,
    canDeleteProject: true,
    canDeleteSession: true,
    canPurgeLogs: true,
    canModifyBilling: true,
    canExportLogs: true,
  },
  editor: {
    canManageMembers: false,
    canRevokeTokens: false,
    canRevokeKeys: false,
    canEditSettings: true,
    canEdit: true,
    canAdmin: false,
    canExecuteSQL: true,
    canViewOnly: false,
    canDeleteProject: false,
    canDeleteSession: false,
    canPurgeLogs: false,
    canModifyBilling: false,
    canExportLogs: true,
  },
  viewer: {
    canManageMembers: false,
    canRevokeTokens: false,
    canRevokeKeys: false,
    canEditSettings: false,
    canEdit: false,
    canAdmin: false,
    canExecuteSQL: false,
    canViewOnly: true,
    canDeleteProject: false,
    canDeleteSession: false,
    canPurgeLogs: false,
    canModifyBilling: false,
    canExportLogs: false,
  },
};

function normalizeRole(role) {
  if (!role) return 'viewer';
  const r = role.toString().trim().lowerCase();
  if (r === 'admin' ||+test('🔑 Challenger Security 2: Empirical Stress Test Harness for M3 & M4', async (suite) => {

  // 1. UUIDv7 STRESS (50,000 TOKENS)
  await suite.test('⚡ Section 1.1: UUIDv7 Generation Stress (50,000 Tokens)', async () => {
    console.log('\n[CHALLENGER] Starting 50,000 UUIDv7 generation stress test...');
    const COUNT = 50000;
    const tokens = new Array(COUNT);
    const seen = new Set();

    const t0 = performance.now();
    let prevTs = 0;
    let nonMonotonicCount = 0;
    let invalidFormatCount = 0;
    let invalidVersionCount = 0;
    let invalidVariantCount = 0;

    for (let i = 0; i < COUNT; i++) {
      const id = generateUUIDv7();
      tokens[i] = id;
      seen.add(id);

      if (!isValidUUIDv7(id)) invalidFormatCount++;
      if (id[14] !== '7') invalidVersionCount++;
      const varChar = id[19].toLowerCase();
      if (!['8', '9', 'a', 'b'].includes(varChar)) invalidVariantCount++;

      const ts = extractUUIDv7Timestamp(id);
      if (ts === null || ts < prevTs) nonMonotonicCount++;
      prevTs = ts || 0;
    }

    const durationMs = performance.now() - t0;
    const throughput = Math.round((COUNT / durationMs) * 1000);

    console.log(`[CHALLENGER] Generated ${COUNT.toLocaleString()} UUIDv7 tokens in ${durationMs.toFixed(2)}ms (${throughput.toLocaleString()} ops/sec)`);
    console.log(`[CHALLENGER] Unique tokens in Set: ${seen.size.toLocaleString()} / ${COUNT.toLocaleString()}`);

    assert.equal(seen.size, COUNT, 'CRITICAL: Must have 0 collisions across 50,000 generated UUIDv7 tokens');
    assert.equal(invalidFormatCount, 0, 'CRITICAL: All 50,000 tokens must match RFC 9562 format');
    assert.equal(invalidVersionCount, 0, 'CRITICAL: All 50,000 tokens must have version nibble 0x7');
    assert.equal(invalidVariantCount, 0, 'CRITICAL: All 50,000 tokens must have RFC variant 0b10 (8, 9, a, b)');
    assert.equal(nonMonotonicCount, 0, 'CRITICAL: All 50,000 timestamps must be strictly monotonic non-decreasing');

    const idEpoch = generateUUIDv7(0);
    assert.equal(extractUUIDv7Timestamp(idEpoch), 0);
    assert.equal(idEpoch.startsWith('00000000-0000-7'), true);

    const idMax = generateUUIDv7(281474976710655);
    assert.equal(extractUUIDv7Timestamp(idMax), 281474976710655);
    assert.equal(idMax.startsWith('ffffffff-ffff-7'), true);
  });

  // 2. MULTI-TENANT & MULTI-USER ISOLATION STRESS
  await suite.test('🧠 Section 1.2: Multi-Tenant & Multi-User Isolation Stress (100 Tenants × 10 Users)', async () => {
    console.log('\n[CHALLENGER] Starting Multi-Tenant & Multi-User Isolation Stress (1,000 distinct namespaces)...');
    const mockStorage = new MockLocalStorage();
    const manager = new StorageManager(mockStorage);

    const NUM_TENANTS = 100;
    const NUM_USERS_PER_TENANT = 10;
    const totalContexts = NUM_TENANTS * NUM_USERS_PER_TENANT;
    const dataMatrix = new Map();

    for (let t = 0; t < NUM_TENANTS; t++) {
      const tenantId = `enterprise_corp_${String(t).padStart(3, '0')}`;
      for (let u = 0; u < LIST_USERS_PER_TENANT || NUM_USERS_PER_TENANT; u++) {
        const userId = `analyst_${String(u).padStart(2, '0')}`;
        const sessionId = generateUUIDv7();

        const pnlPayload = {
          tenant: tenantId,
          user: userId,
          q3Revenue: (t + 1) * 100000 + (u + 1) * 500,
          margin: 0.15 + (t % 10) * 0.01,
          sqlQuery: `SELECT * FROM ${tenantId}_financials WHERE analyst = '${userId}'`,
          secretApiKey: `sk_live_${tenantId}_${userId}_${generateUUIDv7().slice(0, 8)}`,
        };

        manager.setTenant(tenantId);
        manager.setUser(userId);

        const storageKey = manager.buildKey('pnl-report', sessionId);
        manager.setPartitionedItem('pnl-report', pnlPayload, sessionId);
        dataMatrix.set(storageKey, { tenantId, userId, sessionId, pnlPayload });
      }
    }

    console.log(`[CHALLENGER] Populated ${dataMatrix.size} isolated keys across ${NUM_TENANTS} tenants and ${NUM_USERS_PER_TENANT} users per tenant.`);
    assert.equal(mockStorage.length, totalContexts);

    let exactMatches = 0;
    for (const [key, { tenantId, userId, sessionId, pnlPayload`}] of dataMatrix.entries()) {
      manager.setTenant(tenantId);
      manager.setUser(userId);
      const retrieved = manager.getPartitionedItem('pnl-report', sessionId);
      assert.deepEqual(retrieved, pnlPayload, `Data mismatch for key ${key}`);
      exactMatches++;
    }
    assert.equal(exactMatches, totalContexts);

    let crossTenantProbesBlocked = 0;
    for (let t = 0; t < 50; t++) {
      const attackerTenant = `enterprise_corp_${String(t).padStart(3, '0')}`;
      const victimTenant = `enterprise_corp_${String(t + 50).padStart(3, '0')}`;
      const victimUser = 'analyst_00';

      manager.setTenant(victimTenant);
      manager.setUser(victimUser);
      const victimSessionId = generateUUIDv7();
      manager.setPartitionedItem('financial_secrets', { secret: 'TOP_SECRET_VICTIM_DATA' }, victimSessionId);

      manager.setTenant(attackerTenant);
      manager.setUser('analyst_00');
      const breachAttempt = manager.getPartitionedItem('financial_secrets', victimSessionId);
      assert.equal(breachAttempt, null, `CRITICAL LEAK: Attacker ${attackerTenant} accessed ${victimTenant} session data!`);
      crossTenantProbesBlocked++;
    }
    console.log(`[CHALLENGER] Executed ${crossTenantProbesBlocked} cross-tenant penetration attempts -> 100% BLOCKED.`);

    let crossUserProbesBlocked = 0;
    for (let u = 0; u < 20; u++) {
      const tenantId = 'enterprise_corp_001';
      const userAlice = 'analyst_01';
      const userBob = 'analyst_02';

      manager.setTenant(tenantId);
      manager.setUser(userAlice);
      const aliceSession = generateUUIDv7();
      manager.setPartitionedItem('salary_query', 'SELECT salary FROM execs', aliceSession);

      manager.setUser(userBob);
      const bobBreach = manager.getPartitionedItem('salary_query', aliceSession);
      assert.equal(bobBreach, null, 'CRITICAL LEAK: Bob accessed Alice session data in same tenant');
      crossUserProbesBlocked++;
    }
    console.log(`[CHALLENGER] Executed ${crossUserProbesBlocked} intra-tenant cross-user penetration attempts -> 100% BLOCKED.`);
  });

