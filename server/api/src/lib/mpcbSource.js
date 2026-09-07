/**
 * Provenance for the authorised-recycler list.
 *
 * The claim "we only ever show currently-authorised facilities" is only worth
 * anything if the list behind it has a date and a source. A judge can ask where
 * this came from and when; an undated list is indistinguishable from a guess.
 *
 * MPCB publishes this as a PDF, not an API. Scraping a government site live
 * would put a demo at the mercy of that site being up and its markup unchanged,
 * so the CSV is the seed of record and refreshing it is a deliberate, dated act.
 *
 * WHEN YOU REFRESH mpcb_recyclers.csv, UPDATE fetchedOn IN THE SAME COMMIT.
 * A stale date here is worse than no date, because it is a claim rather than
 * an omission.
 */
export const MPCB_SOURCE = {
  authority: "Maharashtra Pollution Control Board (MPCB)",
  list: "Authorised E-Waste Recyclers and Dismantlers",
  format: "PDF, published list — no public API",
  fetchedOn: "2026-08-31",
  file: "mpcb_recyclers.csv",
};

/** Whole days since the list was last refreshed, for the staleness strip. */
export function sourceAgeDays(asOf = new Date()) {
  const then = new Date(`${MPCB_SOURCE.fetchedOn}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((asOf.getTime() - then) / 86_400_000));
}
