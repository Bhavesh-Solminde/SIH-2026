// prisma/metalMandiCategoryMap.js
//
// STEP 1 SCOPE: this file classifies how each app leaf Category.code relates
// to metal_mandi_reference_prices.csv. It does NOT compute prices for
// anything except a genuinely 1:1 match. No averaging, no KG->PIECE
// conversion, no proxy substitution — those are pricing decisions that need
// an explicit, separately-recorded business rule before they belong here.
//
// (A previous pass on this project did compute averages for several of
// these — e.g. CABLE = 370, PCB_COMPUTER = 1014.13 — as a stand-in "best
// effort". Those numbers are NOT reproduced here. Averaging several CSV rows
// into one category price is exactly the kind of silent methodology
// decision this step is meant to surface for a human, not resolve
// unilaterally. See `notes` below for what happened to each of them.)
//
// STATUS LEGEND
//   RESOLVED   — exactly one CSV row is a clear, defensible match: same
//                real-world thing, same unit as the app category expects.
//   AMBIGUOUS  — a real candidate exists but either (a) more than one CSV
//                row could represent this category and choosing/combining
//                them is a business call, or (b) the single candidate only
//                partially matches the category's scope. price is left
//                null; candidateSourceRefIds lists what's available.
//   UNRESOLVED — no defensible CSV source exists, or the units cannot be
//                reconciled without inventing a conversion factor.
//
// App category default units (from prisma/seed/categories.js): everything
// is KG except PANEL_* and CRT, which are PIECE.

export const METAL_MANDI_CATEGORY_MAP = {
  CABLE: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: ["REF081", "REF082", "REF083", "REF084", "REF085"],
    price: null,
    notes:
      "CSV 'Wires & Cables' has 5 rows by gauge/type, ₹114–565/kg (5x " +
      "spread). The app's CABLE category doesn't distinguish gauge. A " +
      "previous pass averaged these to ₹370 — that average is NOT applied " +
      "here; there's no recorded rule saying a flat average is the right " +
      "methodology (vs. e.g. picking the median gauge, or the most commonly " +
      "collected type). Needs a decision on which row(s) represent CABLE, " +
      "or whether the app should split cable into sub-categories the way it " +
      "already does for PCB/BATTERY/PANEL/MOTOR.",
  },

  PCB_COMPUTER: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: [
      "REF101", "REF102", "REF103", "REF104", "REF105", "REF106", "REF107", "REF108",
    ],
    price: null,
    notes:
      "8 'PCB Scrap' rows plausibly fit 'computer or laptop board' (Smart " +
      "Phone, Laptop, Desktop variants), spanning ₹389–1813/kg — board grade " +
      "swings price more than device type does. No rule exists for " +
      "collapsing these into one number; a previous averaging pass (₹1014.13) " +
      "is not reused here for the same reason as CABLE above.",
  },

  PCB_APPLIANCE: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: ["REF109", "REF110", "REF111", "REF112", "REF113", "REF114", "REF115"],
    price: null,
    notes:
      "No literal 'TV board' row exists in the CSV. Set-Top-Box and Keypad-" +
      "Phone rows are the closest lower-value candidates, but 'closest' is a " +
      "judgement call, not a match. Needs confirmation these are even the " +
      "right candidate set before any price is derived from them.",
  },

  PANEL_LAPTOP: {
    status: "UNRESOLVED",
    unit: "PIECE",
    candidateSourceRefIds: [],
    price: null,
    notes:
      "Category.defaultUnit is PIECE; the only relevant CSV rows " +
      "('Displays & Panels', REF116-118) are priced per KG. There is no " +
      "avg-weight-per-panel figure anywhere in the CSV or schema to convert " +
      "KG->PIECE, and fabricating one is explicitly out of scope for this " +
      "step.",
  },

  PANEL_TV: {
    status: "UNRESOLVED",
    unit: "PIECE",
    candidateSourceRefIds: [],
    price: null,
    notes: "Same KG-vs-PIECE problem as PANEL_LAPTOP.",
  },

  CRT: {
    status: "UNRESOLVED",
    unit: "PIECE",
    candidateSourceRefIds: [],
    price: null,
    notes:
      "The CSV has no CRT / old-monitor / old-TV category or item at all — " +
      "not even an ambiguous candidate. Genuinely no source.",
  },

  BATTERY_PHONE: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: ["REF095", "REF096", "REF097", "REF098", "REF099"],
    price: null,
    notes:
      "'Li-ion Battery' has 5 rows that could plausibly be 'phone or laptop " +
      "battery' (Smartphone, Mix, Keypad, Laptop, Earbud/Powerbank/Gadget), " +
      "₹253–649/kg. Which subset counts as 'phone or laptop' vs something " +
      "else is a scoping decision, not something to infer.",
  },

  BATTERY_INVERTER: {
    status: "RESOLVED",
    unit: "KG",
    candidateSourceRefIds: [],
    resolvedRefId: "REF100",
    price: 65.0,
    notes:
      "Single, unambiguous CSV row: 'Li-ion Battery / Non-Portable / UPS', " +
      "kg. Directly matches 'Inverter or UPS battery' — no averaging or " +
      "substitution involved.",
  },

  MOTOR_HDD: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: ["REF087"],
    price: null,
    notes:
      "Only one candidate row ('HDD Magnet' under Magnets & Motors, " +
      "₹1397/kg), but it prices the magnet alone, not a whole hard disk " +
      "assembly (casing, platters, PCB). Whether a MOTOR_HDD lot is 'just " +
      "the magnet' or 'the whole drive' changes what this number means, so " +
      "this is a scope question, not a clean match — left AMBIGUOUS rather " +
      "than promoted to RESOLVED despite there being only one row.",
  },

  MOTOR_FAN: {
    status: "UNRESOLVED",
    unit: "KG",
    candidateSourceRefIds: ["REF089", "REF090"],
    price: null,
    notes:
      "No CSV item is literally a fan/pump motor. The two loosely-related " +
      "candidates ('Alni & Alnico Magnet' ₹296/kg vs 'Ferrite Magnet' " +
      "₹14/kg) are ~20x apart, so treating either as a stand-in would be a " +
      "guess with real financial consequence. Listed as candidates for " +
      "reference but not usable as-is — kept UNRESOLVED rather than " +
      "AMBIGUOUS since neither is actually a defensible match for 'fan or " +
      "pump motor'.",
  },

  PLASTIC: {
    status: "UNRESOLVED",
    unit: "KG",
    candidateSourceRefIds: [],
    price: null,
    notes: "CSV has no mixed-plastic / plastic-housing category or item at all.",
  },

  OTHER: {
    status: "AMBIGUOUS",
    unit: "KG",
    candidateSourceRefIds: ["REF042", "REF043", "REF044"],
    price: null,
    notes:
      "The 3 generic 'E-Waste' rows (without/with accessories, heavy grade, " +
      "₹33-35/kg) are a plausible catch-all for 'Other or mixed', and are " +
      "unusually close together in price (unlike the other AMBIGUOUS " +
      "categories) — but 'plausible catch-all' is still an interpretation " +
      "of what OTHER means, not a stated equivalence.",
  },
};

export function getMappingForCategory(categoryCode) {
  return METAL_MANDI_CATEGORY_MAP[categoryCode] ?? null;
}
