import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, keyHex] = String(stored).split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const key = await scryptAsync(password, Buffer.from(saltHex, "hex"), KEYLEN);
    const expected = Buffer.from(keyHex, "hex");
    if (expected.length !== key.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
