#!/usr/bin/env node
/**
 * Dated refresh path for the MPCB authorised-recycler list.
 *
 * mpcbSource.js (src/lib/mpcbSource.js) already states the policy: MPCB
 * publishes this list as a PDF, not an API. Scraping the government site
 * live would put a demo at the mercy of that site being up and its markup
 * unchanged, so the CSV (mpcb_recyclers.csv) is the seed of record and
 * refreshing it is a deliberate, dated act — never a live scrape.
 *
 * This script does NOT fetch anything. It re-parses a CSV you have already
 * dropped in (same shape seed/seed.js reads) and updates ONLY
 * `authorization_status` / `validity_to` on recycler rows that already
 * exist, matched by the same synthesised `sr-registration` registration
 * number the seed uses. It never creates or deletes a recycler.
 *
 * REFUSAL: mpcbSource.js says, in its own words, "WHEN YOU REFRESH
 * mpcb_recyclers.csv, UPDATE fetchedOn IN THE SAME COMMIT." This script
 * enforces that: it reads the fetchedOn already committed at HEAD and
 * compares it against the fetchedOn in your working tree. If they are the
 * same, it refuses to run — a stale date is a claim ("we checked on this
 * date"), not an omission, and an unchanged one is exactly as untrustworthy
 * as no date at all.
 *
 * Usage:
 *   npm run mpcb:refresh [path-to-csv]     # defaults to mpcb_recyclers.csv
 *                                            at the repo root, same as seed.js
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { MPCB_SOURCE } from "../src/lib/mpcbSource.js";

const DEFAULT_CSV_PATH = fileURLToPath(new URL("../../../mpcb_recyclers.csv", import.meta.url));
const SOURCE_FILE_FROM_REPO_ROOT = "server/api/src/lib/mpcbSource.js";

// ---------------------------------------------------------------------------
// Pure, testable core — no filesystem, no git, no database.
// ---------------------------------------------------------------------------

/** Same synthesis seed/seed.js uses: `registration` alone is not unique. */
export function synthesizeRegistrationNo(row) {
  return `${row.sr}-${row.registration}`;
}

export function parseMpcbCsv(csvText) {
  return parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
}

/** CSV rows -> the authorization_status/validity_to this refresh intends to write. */
export function computeStatusUpdates(rows) {
  return rows.map((row) => ({
    registrationNo: synthesizeRegistrationNo(row),
    authorizationStatus: row.status === "VALID" ? "VALID" : "LAPSED_IN_LIST",
    validityTo: row.validity ? new Date(row.validity) : null,
  }));
}

/**
 * Applies each update by registrationNo. A row with no match in the DB is
 * counted, not thrown on — the CSV may list recyclers this deploy never
 * seeded (a partial demo dataset), and one unmatched row must not abort the
 * rest. Uses `updateMany` (never `create`), so running the same CSV twice
 * converges on the same DB state instead of accumulating rows.
 */
export async function applyStatusUpdates(prisma, updates) {
  let updated = 0;
  let unmatched = 0;
  for (const u of updates) {
    const res = await prisma.recycler.updateMany({
      where: { registrationNo: u.registrationNo },
      data: { authorizationStatus: u.authorizationStatus, validityTo: u.validityTo },
    });
    if (res.count > 0) updated += res.count;
    else unmatched += 1;
  }
  return { total: updates.length, updated, unmatched };
}

export function refusalMessage(date) {
  return `
============================================================================
 REFUSING TO RUN: fetchedOn was not updated in this change
============================================================================

server/api/src/lib/mpcbSource.js still says fetchedOn: "${date}" — the same
value already committed at HEAD.

This script rewrites authorization_status / validity_to on existing recycler
rows from whatever CSV you dropped in. The "N of M currently authorised"
claim this data backs is only defensible with a date attached — a stale
fetchedOn is worse than no date at all, because it is a claim rather than an
omission.

Fix: edit MPCB_SOURCE.fetchedOn in mpcbSource.js to the date you actually
obtained this CSV from MPCB, BEFORE running this script again, and commit
that edit together with the refreshed CSV and this script's DB changes as
one change.
============================================================================
`;
}

/** Throws refusalMessage(currentFetchedOn) if the two dates are identical. */
export function assertFetchedOnUpdated(committedFetchedOn, currentFetchedOn) {
  if (committedFetchedOn === currentFetchedOn) {
    throw new Error(refusalMessage(currentFetchedOn));
  }
}

// ---------------------------------------------------------------------------
// CLI wiring — git, filesystem, database. Not exercised by unit tests.
// ---------------------------------------------------------------------------

/**
 * The fetchedOn value already committed at HEAD, or null if it cannot be
 * determined (not a git repo, file not yet committed, git not on PATH).
 * A null return means the staleness check is skipped with a loud warning
 * rather than silently blocking a first-ever run.
 */
function getCommittedFetchedOn() {
  try {
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      encoding: "utf8",
    }).trim();
    const committedSource = execFileSync(
      "git",
      ["show", `HEAD:${SOURCE_FILE_FROM_REPO_ROOT}`],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const match = committedSource.match(/fetchedOn:\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const csvPath = resolve(process.argv[2] ?? DEFAULT_CSV_PATH);
  const currentFetchedOn = MPCB_SOURCE.fetchedOn;

  const committedFetchedOn = getCommittedFetchedOn();
  if (committedFetchedOn === null) {
    console.warn(
      `WARNING: could not read the committed fetchedOn from git (not a repo, file not ` +
      `yet committed, or git unavailable) — skipping the staleness check. Confirm ` +
      `fetchedOn ("${currentFetchedOn}") is actually today's date before committing.`,
    );
  } else {
    assertFetchedOnUpdated(committedFetchedOn, currentFetchedOn); // throws loudly if stale
  }

  console.log(`mpcb:refresh — reading ${csvPath}`);
  const rows = parseMpcbCsv(readFileSync(csvPath, "utf8"));
  const updates = computeStatusUpdates(rows);

  const prisma = new PrismaClient();
  try {
    const result = await applyStatusUpdates(prisma, updates);
    const validNow = await prisma.recycler.count({ where: { authorizationStatus: "VALID" } });
    const totalRecyclers = await prisma.recycler.count();

    console.log(`  fetchedOn        ${currentFetchedOn}`);
    console.log(`  csv rows         ${result.total}`);
    console.log(`  rows updated     ${result.updated}`);
    console.log(`  no DB match      ${result.unmatched} (in the CSV but not seeded here)`);
    console.log(`  VALID now        ${validNow} of ${totalRecyclers} recyclers in this DB`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
