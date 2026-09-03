// React Native compatible UUIDv7 + reference code generator.
// Uses Math.random() instead of node:crypto — works in both RN and Node.
// For the server-side (API), node:crypto-based randomness is used via the
// server's own copy of this logic. The device only needs collision-avoidance,
// not cryptographic randomness, for ID generation.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let lastMs = 0;
let counter = 0;

function randomBytesCompat(n) {
  // Use crypto.getRandomValues if available (modern React Native / browsers),
  // otherwise fall back to Math.random.
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
    return buf;
  }
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * UUIDv7 — time-ordered UUID. Works in React Native and Node.js.
 */
export function uuidv7() {
  const now = Date.now();
  if (now === lastMs) {
    counter += 1;
  } else {
    lastMs = now;
    counter = 0;
  }
  const bytes = randomBytesCompat(16);
  // 48-bit big-endian millisecond timestamp
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  // version 7 in the high nibble of byte 6
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  // RFC 4122 variant
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const h = bytesToHex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Short human-readable reference code from a UUID. Works in React Native.
 */
export function referenceCodeFromUuid(uuid) {
  if (typeof uuid !== "string" || !UUID_RE.test(uuid)) {
    throw new Error(`referenceCodeFromUuid expects a uuid, got: ${uuid}`);
  }
  const hex = uuid.replace(/-/g, "").slice(-10); // last 5 bytes
  let bits = BigInt(`0x${hex}`);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}
