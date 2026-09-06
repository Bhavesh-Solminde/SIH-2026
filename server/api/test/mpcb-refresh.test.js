// scripts/mpcb-refresh.js — the dated CSV refresh path for the MPCB
// authorised-recycler list.
//
// Exercises the pure, testable core (parse/compute/apply/refusal) directly.
// Never runs the script's CLI entrypoint, so it touches neither git nor a
// real mpcb_recyclers.csv — only the small fixture CSVs defined below.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  synthesizeRegistrationNo,
  parseMpcbCsv,
  computeStatusUpdates,
  applyStatusUpdates,
  assertFetchedOnUpdated,
  refusalMessage,
} from "../scripts/mpcb-refresh.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";

afterAll(() => prisma.$disconnect());

const HEADER = "sr,name_address,type,capacity_MTA,registration,issue_date,validity,status,district,email,phone";

// One row LAPSED -> VALID (registration "REG-A"), one row staying VALID with
// a later validity date (registration "REG-B") — a small, realistic fixture,
// not the real MPCB list.
const FIXTURE_CSV = [
  HEADER,
  '1,"Fixture Recycler A, Test Town",Recycler,500,REG-A,2020-01-01,2027-01-01,VALID,TestDistrict,a@example.com,9000000001',
  '2,"Fixture Recycler B, Test Town",Recycler,300,REG-B,2019-06-01,2026-12-31,LAPSED_IN_LIST,TestDistrict,b@example.com,9000000002',
].join("\n");

describe("mpcb-refresh: parsing and status computation", () => {
  it("parses the CSV and synthesises the same sr-registration key the seed uses", () => {
    const rows = parseMpcbCsv(FIXTURE_CSV);
    expect(rows).toHaveLength(2);
    expect(synthesizeRegistrationNo(rows[0])).toBe("1-REG-A");
    expect(synthesizeRegistrationNo(rows[1])).toBe("2-REG-B");
  });

  it("maps CSV status to authorizationStatus and parses validity into validityTo", () => {
    const rows = parseMpcbCsv(FIXTURE_CSV);
    const updates = computeStatusUpdates(rows);

    expect(updates).toEqual([
      { registrationNo: "1-REG-A", authorizationStatus: "VALID", validityTo: new Date("2027-01-01") },
      { registrationNo: "2-REG-B", authorizationStatus: "LAPSED_IN_LIST", validityTo: new Date("2026-12-31") },
    ]);
  });

  it("treats any non-VALID CSV status as LAPSED_IN_LIST, and a blank validity as null", () => {
    const csv = [
      HEADER,
      '9,"Fixture Recycler C, Test Town",Recycler,100,REG-C,2020-01-01,,SUSPENDED,TestDistrict,,',
    ].join("\n");
    const updates = computeStatusUpdates(parseMpcbCsv(csv));
    expect(updates).toEqual([
      { registrationNo: "9-REG-C", authorizationStatus: "LAPSED_IN_LIST", validityTo: null },
    ]);
  });
});

describe("mpcb-refresh: applying updates against the database", () => {
  beforeEach(() => truncateAll());

  it("updates authorizationStatus/validityTo on the matching recycler row", async () => {
    await makeRecycler({ registrationNo: "1-REG-A", authorizationStatus: "LAPSED_IN_LIST", validityTo: null });
    const updates = computeStatusUpdates(parseMpcbCsv(FIXTURE_CSV));

    const result = await applyStatusUpdates(prisma, updates);
    expect(result).toEqual({ total: 2, updated: 1, unmatched: 1 });

    const row = await prisma.recycler.findUnique({ where: { registrationNo: "1-REG-A" } });
    expect(row.authorizationStatus).toBe("VALID");
    expect(row.validityTo.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("is idempotent: applying the same CSV twice leaves the same single row in the same state", async () => {
    await makeRecycler({ registrationNo: "2-REG-B", authorizationStatus: "VALID", validityTo: new Date("2099-01-01") });
    const updates = computeStatusUpdates(parseMpcbCsv(FIXTURE_CSV));

    const first = await applyStatusUpdates(prisma, updates);
    const second = await applyStatusUpdates(prisma, updates);
    expect(first).toEqual(second);

    const rows = await prisma.recycler.findMany({ where: { registrationNo: "2-REG-B" } });
    expect(rows).toHaveLength(1); // never creates — only updateMany on an existing row
    expect(rows[0].authorizationStatus).toBe("LAPSED_IN_LIST");
    expect(rows[0].validityTo.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("never creates a recycler for a CSV row with no matching registrationNo", async () => {
    const before = await prisma.recycler.count();
    await applyStatusUpdates(prisma, computeStatusUpdates(parseMpcbCsv(FIXTURE_CSV)));
    const after = await prisma.recycler.count();
    expect(after).toBe(before); // 0 -> 0: both fixture rows were unmatched
  });
});

describe("mpcb-refresh: the fetchedOn refusal", () => {
  it("refuses when the current fetchedOn matches what is already committed", () => {
    expect(() => assertFetchedOnUpdated("2026-08-31", "2026-08-31")).toThrow(/REFUSING TO RUN/);
  });

  it("names the stale date in the refusal message", () => {
    expect(() => assertFetchedOnUpdated("2026-08-31", "2026-08-31")).toThrow(/2026-08-31/);
  });

  it("does not throw once fetchedOn has actually moved forward", () => {
    expect(() => assertFetchedOnUpdated("2026-08-31", "2026-09-06")).not.toThrow();
  });

  it("the refusal message explains why, not just that it refused", () => {
    const message = refusalMessage("2026-08-31");
    expect(message).toMatch(/mpcbSource\.js/);
    expect(message).toMatch(/before committing|before running/i);
  });
});
