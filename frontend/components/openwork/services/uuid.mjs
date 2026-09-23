/**
 * uuid.mjs — RFC 9562 Compliant UUIDv7 Generator (ESM)
 */

export function generateUUIDv7() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const now = Date.now();

    // 48-bit big-endian timestamp in milliseconds
    bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
    bytes[1] = Math.floor(now / 0x100000000) & 0xff;
    bytes[2] = Math.floor(now / 0x1000000) & 0xff;
    bytes[3] = Math.floor(now / 0x10000) & 0xff;
    bytes[4] = Math.floor(now / 0x100) & 0xff;
    bytes[5] = now & 0xff;

    // Version 7 (0111 in upper 4 bits of octet 6)
    bytes[6] = (bytes[6] & 0x0f) | 0x70;

    // Variant RFC 4122/9562 (10xx in upper 2 bits of octet 8)
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

  // Fallback
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  const rand1 = Math.floor(Math.random() * 0x0fff).toString(16).padStart(3, '0');
  const rand2 = Math.floor(Math.random() * 0x3fff | 0x8000).toString(16).padStart(4, '0');
  const rand3 = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0');

  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${rand1}-${rand2}-${rand3}`;
}

export function isValidUUIDv7(id) {
  if (typeof id !== 'string' || id.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
