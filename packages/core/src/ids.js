import { randomBytes } from "node:crypto";

// Crockford Base32 — no I, L, O or U, so a reference code read aloud over a
// counter cannot be confused with 1 or 0.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let lastMs = 0;
let counter = 0;

/**
 * UUIDv7 — time-ordered, so records sort naturally and index well
 * (SERVER.md section 2.2). Generated on the device, which is what lets a
 * record have an identity before it has ever seen a server.
 *
 * The monotonic counter guards against two calls inside the same millisecond
 * producing the same prefix.
 */
export function uuidv7() {
  const now = Date.now();
  if (now === lastMs) {
    counter += 1;
  } else {
    lastMs = now;
    counter = 0;
  }
  const bytes = randomBytes(16);
  // 48-bit big-endian millisecond timestamp
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  // version 7 in the high nibble of byte 6, 12 counter bits across 6 and 7
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  // RFC 4122 variant
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Short human-readable code printed on the handover slip and encoded in the QR.
 *
 * DB.md section 3.7: Base32 of the first 5 bytes of the lot UUID, 8 characters.
 * 5 bytes = 40 bits = exactly 8 Base32 symbols, no padding. Derived on the
 * DEVICE so it exists offline; the UNIQUE constraint catches the vanishingly
 * unlikely collision.
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
