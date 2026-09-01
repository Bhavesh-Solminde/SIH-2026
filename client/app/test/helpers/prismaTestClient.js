import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { PrismaClient } from "../../src/db/generated-node/index.js";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");

/**
 * A node-engine Prisma client against a fresh temp SQLite file, with every
 * committed migration applied. The repos are engine-agnostic — they call
 * prisma.lot.create(), prisma.$transaction(), etc. — so this exercises the
 * exact code path the react-native client runs on the phone.
 */
export async function makePrismaClient() {
  const dir = mkdtempSync(join(tmpdir(), "bhaav-"));
  const url = `file:${join(dir, "test.db")}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  for (const name of readdirSync(MIGRATIONS_DIR).sort()) {
    if (name === "_bundled" || name === "migration_lock.toml") continue;
    const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
    let sql;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch {
      continue; // migration_lock.toml and the like
    }
    for (const stmt of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
    }
  }
  return prisma;
}
