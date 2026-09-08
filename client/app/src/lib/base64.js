// Pure-JS base64 decoder. Hermes (React Native's JS engine) does not ship
// atob/btoa, and expo-file-system hands back photo bytes as base64 text —
// this turns that back into a Uint8Array so sha256.js can hash the actual
// file bytes, matching what multer/node:crypto sees server-side.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i;

export function base64ToBytes(base64) {
  const clean = base64.replace(/[\r\n]/g, '');
  const padMatch = clean.match(/=+$/);
  const padLen = padMatch ? padMatch[0].length : 0;
  const len = clean.length;
  const outLen = Math.floor((len * 3) / 4) - padLen;
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const b0 = LOOKUP[clean.charCodeAt(i)];
    const b1 = LOOKUP[clean.charCodeAt(i + 1)];
    const b2 = i + 2 < len ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const b3 = i + 3 < len ? LOOKUP[clean.charCodeAt(i + 3)] : 0;

    if (outIdx < outLen) out[outIdx++] = (b0 << 2) | (b1 >> 4);
    if (outIdx < outLen) out[outIdx++] = ((b1 & 0x0f) << 4) | (b2 >> 2);
    if (outIdx < outLen) out[outIdx++] = ((b2 & 0x03) << 6) | b3;
  }
  return out;
}
