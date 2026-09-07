// Point the Prisma client at the test database before any module imports it.
//
// vitest is invoked directly (not via `node --env-file`), so nothing loads the
// repo .env for us. Without this the DATABASE_URL_TEST below is undefined and
// the whole API suite silently falls back to a default that may not exist —
// which surfaces as 89 confusing PrismaClientInitializationErrors rather than
// "your test database is not configured".
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadRepoEnv() {
  try {
    // Resolve relative to THIS file, never process.cwd(): vitest runs this
    // suite both from server/api and from the repo-root workspace, and a
    // cwd-relative path silently reads nothing in one of them — which shows up
    // as the suite quietly using the fallback database instead of the
    // configured one.
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(resolve(here, "../../../.env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key] !== undefined) continue; // real env always wins
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env is fine — the defaults below still apply.
  }
}
loadRepoEnv();

// DATABASE_URL_TEST is set to Supabase deliberately (see .env). Every test
// truncates all 11 tables first, so a run empties that database. The local
// fallback below only applies if .env is missing entirely.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://solminde@localhost:5433/bhaav_test?schema=public";
process.env.SESSION_SECRET = "test-secret";

// Two distinct ML services — see server/api/src/lib/aiml.js.
process.env.AIML_PREDICT_URL = process.env.AIML_PREDICT_URL ?? "http://127.0.0.1:8000";
process.env.AIML_DETECT_URL = process.env.AIML_DETECT_URL ?? "http://127.0.0.1:8000";
