#!/usr/bin/env node
/**
 * Snapshot / restore the database behind DATABASE_URL as JSON.
 *
 * The API test suite truncates every table before every test, so when the test
 * database is a shared one, a snapshot is the difference between a bad run and
 * a lost afternoon.
 *
 *   node scripts/db-snapshot.js backup            → backups/<iso>.json
 *   node scripts/db-snapshot.js restore [file]    → newest snapshot unless named
 *
 * Restore is additive and idempotent: rows that already exist are left alone,
 * so it is safe to run twice, and safe to run against a partially-wiped table.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../backups");
// Parents before children — restore order matters, backup order does not.
const MODELS = ["category", "recycler", "recyclerAccount", "rate", "collector",
                "lot", "acceptance", "handover", "photo", "anomalyFlag"];

const prisma = new PrismaClient();
const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");

async function backup() {
  const data = {};
  for (const m of MODELS) data[m] = await prisma[m].findMany();
  mkdirSync(DIR, { recursive: true });
  const file = `${DIR}/db-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), host, data },
    (k, v) => (typeof v === "bigint" ? String(v) : v), 2));
  console.log(`snapshot → ${file}  (${host})`);
  for (const m of MODELS) if (data[m].length) console.log(`  ${m.padEnd(18)} ${data[m].length}`);
}

async function restore(named) {
  const file = named ?? `${DIR}/${readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().pop()}`;
  const snap = JSON.parse(readFileSync(file, "utf8"));
  console.log(`restoring ${file}\n  taken ${snap.takenAt} from ${snap.host ?? "?"}\n  into  ${host}`);
  const cats = snap.data.category ?? [];
  const ordered = { ...snap.data, category: [...cats.filter((c) => !c.parentId), ...cats.filter((c) => c.parentId)] };
  for (const m of MODELS) {
    const rows = ordered[m] ?? [];
    let created = 0, present = 0, failed = 0;
    for (const row of rows) {
      try { await prisma[m].create({ data: row }); created++; }
      catch (e) { e.code === "P2002" ? present++ : (failed++, failed <= 2 && console.log(`  ! ${m} ${e.code}: ${e.message.split("\n")[0].slice(0, 90)}`)); }
    }
    if (rows.length) console.log(`  ${m.padEnd(18)} +${created}${present ? ` (${present} already there)` : ""}${failed ? ` FAILED ${failed}` : ""}`);
  }
}

const [cmd, file] = process.argv.slice(2);
try {
  if (cmd === "backup") await backup();
  else if (cmd === "restore") await restore(file);
  else { console.error("usage: db-snapshot.js backup | restore [file]"); process.exitCode = 1; }
} finally { await prisma.$disconnect(); }
