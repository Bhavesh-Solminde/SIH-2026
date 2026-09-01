import { PrismaClient } from "./generated/index.js";
import { migrations } from "./migrations.js";

let client = null;

/**
 * The device Prisma client singleton. On React Native the generated client
 * targets the `react-native` engine over react-native-quick-sqlite; the app
 * never opens a raw handle.
 *
 * On-device migrations are the bundled SQL applied once at first open. There
 * is no `prisma migrate dev` on the phone — `migrations.js` re-exports the
 * committed SQL, and `applyMigrations` runs any not yet recorded in
 * `_migrations`.
 */
export async function getPrisma() {
  if (client) return client;
  client = new PrismaClient();
  await applyMigrations(client);
  return client;
}

export async function applyMigrations(prisma) {
  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = new Set(
    (await prisma.$queryRawUnsafe("SELECT name FROM _migrations")).map((r) => r.name),
  );
  for (const { name, sql } of migrations) {
    if (done.has(name)) continue;
    for (const stmt of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
    }
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(
      "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
      name,
      new Date().toISOString(),
    );
  }
}

// Test-only. Never called from app code.
export function __resetClientForTests() {
  client = null;
}
