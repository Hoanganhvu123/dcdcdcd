/**
 * storage-manager.ts — Session Isolation & RFC 9562 UUIDv7 Storage Partitioning
 *
 * Provides:
 * 1. RFC 9562 compliant UUIDv7 generator (millisecond time-ordered 48-bit timestamp + ver 7 + variant 10 + pseudo-random).
 * 2. Hierarchical storage key partitioning: `openwork:v7:{tenant}:{user}:{session}:{type}`.
 * 3. Multi-tenant and multi-user isolation preventing cross-session and cross-user data leaks.
 * 4. Comprehensive zero-residual session purging (`purgeSession`, `purgeAllUserSessions`).
 * 5. Automatic backward-compatibility migration layer for legacy `openwork:*` keys.
 * 6. SSR / in-memory fallback for headless or restricted storage environments.
 */

// ── Types ──

export interface StoragePartitionOptions {
  tenant?: string;
  user?: string;
  session?: string;
  type: string;
}

export interface StorageKeyComponents {
  version: 'v7';
  tenant: string;
  user: string;
  session: string;
  type: string;
}

export interface LegacyMigrationResult {
  migratedCount: number;
  migratedKeys: string[];
  errors: string[];
}

// ── Constants ──

export const STORAGE_PREFIX = 'openwork:v7';
export const DEFAULT_TENANT = 'default';
export const DEFAULT_USER = 'default';
export const GLOBAL_SESSION_ID = 'global';

// Legacy keys mapping for backward compatibility
export const LEGACY_KEY_MAP: Record<string, { type: string; session?: string }> = {
  'openwork:sessions:v1': { type: 'sessions', session: GLOBAL_SESSION_ID },
  'openwork:active-session:v1': { type: 'active-session', session: GLOBAL_SESSION_ID },
  'openwork:ui-state:v1': { type: 'ui-state', session: GLOBAL_SESSION_ID },
  'openwork:settings:v1': { type: 'settings', session: GLOBAL_SESSION_ID },
  'openwork:skills:v1': { type: 'skills', session: GLOBAL_SESSION_ID },
  'openwork:active-datasource:v1': { type: 'active-datasource', session: GLOBAL_SESSION_ID },
  'openwork_active_datasource_id': { type: 'active-datasource', session: GLOBAL_SESSION_ID },
};

// ── RFC 9562 UUIDv7 Implementation ──

/**
 * Generate an RFC 9562 compliant UUIDv7 string.
 *
 * Structure (128 bits / 16 bytes):
 * - unix_ts_ms (48 bits): Millisecond timestamp
 * - ver (4 bits): 0b0111 (7)
 * - rand_a (12 bits): Pseudo-random / sub-millisecond sequence
 * - var (2 bits): 0b10 (RFC 4122/9562 variant)
 * - rand_b (62 bits): Pseudo-random bits
 *
 * @param customTimestamp Optional custom unix timestamp in milliseconds
 * @returns 36-character canonical lowercase hyphenated UUIDv7
 */
export function generateUUIDv7(customTimestamp?: number): string {
  const now = typeof customTimestamp === 'number' && !isNaN(customTimestamp)
    ? customTimestamp
    : Date.now();

  const cryptoObj =
    typeof crypto !== 'undefined'
      ? crypto
      : typeof globalThis !== 'undefined'
      ? (globalThis as any).crypto
      : undefined;

  const bytes = new Uint8Array(16);

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
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

  const hex: string[] = [];
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

/**
 * Validate whether a string conforms to RFC 9562 UUIDv7.
 */
export function isValidUUIDv7(id: unknown): boolean {
  if (typeof id !== 'string' || id.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Extract the millisecond timestamp from an RFC 9562 UUIDv7.
 * Returns null if the UUID is invalid.
 */
export function extractUUIDv7Timestamp(uuid: string): number | null {
  if (!isValidUUIDv7(uuid)) return null;
  const cleanHex = uuid.replace(/-/g, '').slice(0, 12);
  const timestamp = parseInt(cleanHex, 16);
  return isNaN(timestamp) ? null : timestamp;
}

// ── Storage Key Namespace Builder & Parser ──

/**
 * Build a partitioned storage key in the standard namespace:
 * `openwork:v7:{tenant}:{user}:{session}:{type}`
 *
 * Supports flexible overload signatures:
 * 1. Object: `buildStorageKey({ tenant, user, session, type })`
 * 2. Positional: `buildStorageKey(tenant, user, session, type)`
 * 3. Simple type: `buildStorageKey(type)`
 */
export function buildStorageKey(
  arg1: StoragePartitionOptions | string,
  arg2?: string,
  arg3?: string,
  arg4?: string,
): string {
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

  // Single argument = type name under current context defaults
  const type = sanitizeNamespacePart(typeof arg1 === 'string' ? arg1 : 'data');
  return `${STORAGE_PREFIX}:${DEFAULT_TENANT}:${DEFAULT_USER}:${GLOBAL_SESSION_ID}:${type}`;
}

/**
 * Parse a raw storage key into its component namespace elements.
 */
export function parseStorageKey(key: string): StorageKeyComponents | null {
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

function sanitizeNamespacePart(input: string): string {
  if (!input) return 'default';
  return String(input).trim().replace(/[:\s]/g, '_');
}

// ── Storage Manager Class ──

export class StorageManager {
  private inMemoryStore = new Map<string, string>();
  private currentTenant = DEFAULT_TENANT;
  private currentUser = DEFAULT_USER;

  /**
   * Configure the active tenant namespace.
   */
  public setTenant(tenant: string): void {
    this.currentTenant = tenant ? sanitizeNamespacePart(tenant) : DEFAULT_TENANT;
  }

  public getTenant(): string {
    return this.currentTenant;
  }

  /**
   * Configure the active user namespace.
   */
  public setUser(user: string): void {
    this.currentUser = user ? sanitizeNamespacePart(user) : DEFAULT_USER;
  }

  public getUser(): string {
    return this.currentUser;
  }

  /**
   * Resolve safe localStorage handle.
   */
  private getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
    } catch {
      // Storage access blocked or restricted
    }
    return null;
  }

  /**
   * Low-level raw get item.
   */
  public getItem<T = any>(key: string, defaultValue?: T): T | null {
    if (!key) return defaultValue ?? null;

    let rawValue: string | null = null;
    const storage = this.getStorage();

    if (storage) {
      try {
        rawValue = storage.getItem(key);
      } catch {
        rawValue = this.inMemoryStore.get(key) ?? null;
      }
    } else {
      rawValue = this.inMemoryStore.get(key) ?? null;
    }

    if (rawValue === null || rawValue === undefined) {
      return defaultValue ?? null;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return rawValue as unknown as T;
    }
  }

  /**
   * Low-level raw set item.
   */
  public setItem<T = any>(key: string, value: T): boolean {
    if (!key) return false;

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const storage = this.getStorage();

    if (storage) {
      try {
        storage.setItem(key, serialized);
        return true;
      } catch (err) {
        // Fallback to memory on QuotaExceeded or security errors
        this.inMemoryStore.set(key, serialized);
        return false;
      }
    } else {
      this.inMemoryStore.set(key, serialized);
      return true;
    }
  }

  /**
   * Low-level raw remove item.
   */
  public removeItem(key: string): void {
    if (!key) return;
    const storage = this.getStorage();
    if (storage) {
      try {
        storage.removeItem(key);
      } catch {}
    }
    this.inMemoryStore.delete(key);
  }

  /**
   * Build a scoped key using instance context.
   */
  public buildKey(type: string, session: string = GLOBAL_SESSION_ID): string {
    return buildStorageKey(this.currentTenant, this.currentUser, session, type);
  }

  /**
   * Read partitioned item with automatic legacy key migration fallback.
   */
  public getPartitionedItem<T = any>(
    typeOrOptions: StoragePartitionOptions | string,
    sessionOrKeyOrDef?: string | T,
    defaultValue?: T,
  ): T | null {
    let key: string;
    let fallbackType: string | undefined;
    let fallbackSession: string | undefined;
    let effectiveDefault: T | null = null;

    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      key = buildStorageKey(typeOrOptions);
      fallbackType = typeOrOptions.type;
      fallbackSession = typeOrOptions.session || GLOBAL_SESSION_ID;
      effectiveDefault = (sessionOrKeyOrDef as T) ?? null;
    } else if (typeof typeOrOptions === 'string' && typeOrOptions.startsWith(`${STORAGE_PREFIX}:`)) {
      // Direct partitioned key passed
      key = typeOrOptions;
      const parsed = parseStorageKey(typeOrOptions);
      if (parsed) {
        fallbackType = parsed.type;
        fallbackSession = parsed.session;
      }
      effectiveDefault = (sessionOrKeyOrDef as T) ?? null;
    } else {
      // Type name + optional session + optional default value
      const type = typeOrOptions as string;
      const session = typeof sessionOrKeyOrDef === 'string' ? sessionOrKeyOrDef : GLOBAL_SESSION_ID;
      key = this.buildKey(type, session);
      fallbackType = type;
      fallbackSession = session;
      effectiveDefault = defaultValue !== undefined ? defaultValue : (typeof sessionOrKeyOrDef !== 'string' ? (sessionOrKeyOrDef as T) : null);
    }

    const val = this.getItem<T>(key);
    if (val !== null && val !== undefined) {
      return val;
    }

    // ── Legacy Key Backward Compatibility Fallback ──
    if (fallbackType) {
      const legacyValue = this.checkAndMigrateLegacy(fallbackType, fallbackSession, key);
      if (legacyValue !== null && legacyValue !== undefined) {
        return legacyValue as T;
      }
    }

    return effectiveDefault;
  }

  /**
   * Set partitioned item.
   */
  public setPartitionedItem<T = any>(
    typeOrOptions: StoragePartitionOptions | string,
    valueOrSession: T | string,
    sessionOrValue?: string | T,
  ): boolean {
    let key: string;
    let value: T;

    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      key = buildStorageKey(typeOrOptions);
      value = valueOrSession as T;
    } else if (typeof typeOrOptions === 'string' && typeOrOptions.startsWith(`${STORAGE_PREFIX}:`)) {
      key = typeOrOptions;
      value = valueOrSession as T;
    } else {
      const type = typeOrOptions as string;
      let session = GLOBAL_SESSION_ID;
      if (typeof sessionOrValue === 'string') {
        session = sessionOrValue;
        value = valueOrSession as T;
      } else if (sessionOrValue !== undefined) {
        value = sessionOrValue as T;
        session = typeof valueOrSession === 'string' ? valueOrSession : GLOBAL_SESSION_ID;
      } else {
        value = valueOrSession as T;
      }
      key = this.buildKey(type, session);
    }

    return this.setItem(key, value);
  }

  /**
   * Remove partitioned item.
   */
  public removePartitionedItem(
    typeOrOptions: StoragePartitionOptions | string,
    session?: string,
  ): void {
    let key: string;
    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      key = buildStorageKey(typeOrOptions);
    } else if (typeof typeOrOptions === 'string' && typeOrOptions.startsWith(`${STORAGE_PREFIX}:`)) {
      key = typeOrOptions;
    } else {
      key = this.buildKey(typeOrOptions as string, session || GLOBAL_SESSION_ID);
    }
    this.removeItem(key);
  }

  /**
   * Check for legacy keys, migrate to partitioned v7 storage, and return legacy value.
   */
  private checkAndMigrateLegacy(type: string, session?: string, targetV7Key?: string): any {
    const storage = this.getStorage();
    if (!storage) return null;

    const legacyCandidates: string[] = [];

    // Check specific session data legacy keys
    if (session && session !== GLOBAL_SESSION_ID) {
      if (type === 'session-data' || type === 'stream-parts' || type === 'artifacts') {
        legacyCandidates.push(`openwork:session-data:${session}`);
      }
      if (type === 'local-messages' || type === 'messages') {
        legacyCandidates.push(`openwork:local_messages:${session}`);
      }
      legacyCandidates.push(`openwork:${type}:${session}`);
    }

    // Check global legacy map
    for (const [legacyKey, meta] of Object.entries(LEGACY_KEY_MAP)) {
      if (meta.type === type && (!session || meta.session === session || meta.session === GLOBAL_SESSION_ID)) {
        legacyCandidates.push(legacyKey);
      }
    }

    for (const legKey of legacyCandidates) {
      try {
        const raw = storage.getItem(legKey);
        if (raw !== null && raw !== undefined) {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }

          // Migrate to v7 key
          if (targetV7Key) {
            this.setItem(targetV7Key, parsed);
          }
          return parsed;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Purge all storage partitions associated with a specific session (Zero-residual leak prevention).
   * Removes both partitioned `openwork:v7:*:*:{sessionId}:*` and legacy `openwork:session-data:{sessionId}`, `openwork:local_messages:{sessionId}`.
   *
   * @param sessionId Session identifier to purge
   * @param user Optional target user constraint
   * @param tenant Optional target tenant constraint
   * @returns Total number of keys purged
   */
  public purgeSession(sessionId: string, user?: string, tenant?: string): number {
    if (!sessionId || typeof sessionId !== 'string') return 0;
    const cleanId = sessionId.trim();
    if (!cleanId) return 0;

    let purgedCount = 0;
    const keysToRemove: string[] = [];

    // 1. Scan localStorage
    const storage = this.getStorage();
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;

          if (this.isKeyMatchingSession(key, cleanId, user, tenant)) {
            keysToRemove.push(key);
          }
        }
      } catch {}
    }

    // 2. Scan in-memory fallback
    for (const key of this.inMemoryStore.keys()) {
      if (this.isKeyMatchingSession(key, cleanId, user, tenant)) {
        if (!keysToRemove.includes(key)) {
          keysToRemove.push(key);
        }
      }
    }

    // 3. Remove all matching keys
    for (const key of keysToRemove) {
      this.removeItem(key);
      purgedCount++;
    }

    return purgedCount;
  }

  /**
   * Alias for interface contract parity: purgeSessionData.
   */
  public purgeSessionData(sessionId: string): void {
    this.purgeSession(sessionId);
  }

  /**
   * Purge all sessions belonging to a specific user (or current user).
   * Retains global settings and preferences while scrubbing all session history, SQL queries, and chat traces.
   */
  public purgeAllUserSessions(user?: string, tenant?: string): number {
    const targetUser = user ? sanitizeNamespacePart(user) : this.currentUser;
    const targetTenant = tenant ? sanitizeNamespacePart(tenant) : this.currentTenant;

    let purgedCount = 0;
    const keysToRemove: string[] = [];

    const storage = this.getStorage();
    if (storage) {
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;

          const parsed = parseStorageKey(key);
          if (
            parsed &&
            parsed.tenant === targetTenant &&
            parsed.user === targetUser &&
            parsed.session !== GLOBAL_SESSION_ID
          ) {
            keysToRemove.push(key);
          }
        }
      } catch {}
    }

    for (const key of this.inMemoryStore.keys()) {
      const parsed = parseStorageKey(key);
      if (
        parsed &&
        parsed.tenant === targetTenant &&
        parsed.user === targetUser &&
        parsed.session !== GLOBAL_SESSION_ID
      ) {
        if (!keysToRemove.includes(key)) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      this.removeItem(key);
      purgedCount++;
    }

    return purgedCount;
  }

  /**
   * Check if a key belongs to the target session.
   */
  private isKeyMatchingSession(
    key: string,
    sessionId: string,
    userConstraint?: string,
    tenantConstraint?: string,
  ): boolean {
    // V7 partitioned key check
    const parsed = parseStorageKey(key);
    if (parsed) {
      if (parsed.session === sessionId) {
        if (tenantConstraint && parsed.tenant !== tenantConstraint) return false;
        if (userConstraint && parsed.user !== userConstraint) return false;
        return true;
      }
      return false;
    }

    // Legacy unpartitioned key checks
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

  /**
   * Migrate all legacy keys in storage to the partitioned v7 schema.
   */
  public migrateLegacyKeys(user?: string, tenant?: string): LegacyMigrationResult {
    const targetUser = user ? sanitizeNamespacePart(user) : this.currentUser;
    const targetTenant = tenant ? sanitizeNamespacePart(tenant) : this.currentTenant;

    const result: LegacyMigrationResult = {
      migratedCount: 0,
      migratedKeys: [],
      errors: [],
    };

    const storage = this.getStorage();
    if (!storage) return result;

    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) keys.push(k);
      }

      for (const legacyKey of keys) {
        // Skip already partitioned v7 keys
        if (legacyKey.startsWith(`${STORAGE_PREFIX}:`)) continue;

        // Check exact legacy map
        if (LEGACY_KEY_MAP[legacyKey]) {
          const mapping = LEGACY_KEY_MAP[legacyKey];
          const newKey = buildStorageKey(targetTenant, targetUser, mapping.session || GLOBAL_SESSION_ID, mapping.type);
          const raw = storage.getItem(legacyKey);
          if (raw !== null) {
            try {
              const parsed = JSON.parse(raw);
              this.setItem(newKey, parsed);
              result.migratedCount++;
              result.migratedKeys.push(`${legacyKey} -> ${newKey}`);
            } catch (err: any) {
              result.errors.push(`Failed to migrate ${legacyKey}: ${err?.message}`);
            }
          }
        }

        // Check session-data prefix
        if (legacyKey.startsWith('openwork:session-data:')) {
          const sessionId = legacyKey.replace('openwork:session-data:', '');
          const newKey = buildStorageKey(targetTenant, targetUser, sessionId, 'session-data');
          const raw = storage.getItem(legacyKey);
          if (raw !== null) {
            try {
              const parsed = JSON.parse(raw);
              this.setItem(newKey, parsed);
              result.migratedCount++;
              result.migratedKeys.push(`${legacyKey} -> ${newKey}`);
            } catch (err: any) {
              result.errors.push(`Failed to migrate ${legacyKey}: ${err?.message}`);
            }
          }
        }

        // Check local_messages prefix
        if (legacyKey.startsWith('openwork:local_messages:')) {
          const sessionId = legacyKey.replace('openwork:local_messages:', '');
          const newKey = buildStorageKey(targetTenant, targetUser, sessionId, 'local-messages');
          const raw = storage.getItem(legacyKey);
          if (raw !== null) {
            try {
              const parsed = JSON.parse(raw);
              this.setItem(newKey, parsed);
              result.migratedCount++;
              result.migratedKeys.push(`${legacyKey} -> ${newKey}`);
            } catch (err: any) {
              result.errors.push(`Failed to migrate ${legacyKey}: ${err?.message}`);
            }
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`Migration loop error: ${err?.message}`);
    }

    return result;
  }
}

// ── Global Singleton Instance ──

export const storageManager = new StorageManager();

// ── Convenient Top-Level Export Wrappers ──

export function getPartitionedItem<T = any>(
  typeOrOptions: StoragePartitionOptions | string,
  sessionOrDefault?: string | T,
  defaultValue?: T,
): T | null {
  return storageManager.getPartitionedItem<T>(typeOrOptions, sessionOrDefault, defaultValue);
}

export function setPartitionedItem<T = any>(
  typeOrOptions: StoragePartitionOptions | string,
  valueOrSession: T | string,
  sessionOrValue?: string | T,
): boolean {
  return storageManager.setPartitionedItem<T>(typeOrOptions, valueOrSession, sessionOrValue);
}

export function removePartitionedItem(
  typeOrOptions: StoragePartitionOptions | string,
  session?: string,
): void {
  storageManager.removePartitionedItem(typeOrOptions, session);
}

export function purgeSessionData(sessionId: string): void {
  storageManager.purgeSession(sessionId);
}

export function purgeSession(sessionId: string, user?: string, tenant?: string): number {
  return storageManager.purgeSession(sessionId, user, tenant);
}

export function purgeAllUserSessions(user?: string, tenant?: string): number {
  return storageManager.purgeAllUserSessions(user, tenant);
}

export function migrateLegacyKeys(user?: string, tenant?: string): LegacyMigrationResult {
  return storageManager.migrateLegacyKeys(user, tenant);
}
