// FRONTEND.md S2 (the eight-icon grid) and S3 (the four clarifying questions).
//
// critical_minerals is not decoration: lithium, cobalt, neodymium, tantalum,
// gallium and indium are why the Ministry of Mines commissioned this problem
// statement, and this column is what lets the pitch say so with data behind it.
//
// expected_qty_min/max stay NULL. They are populated from field data, and
// detectors D4/D5 must not run until they are set (README open item 7).

export const PARENTS = [
  {
    code: "CABLE",
    nameEn: "Cables and wire",
    nameMr: "तार",
    nameHi: "तार",
    iconKey: "cable",
    defaultUnit: "KG",
    criticalMinerals: ["copper", "aluminium"],
  },
  {
    code: "PCB",
    nameEn: "Circuit board",
    nameMr: "सर्किट बोर्ड",
    nameHi: "सर्किट बोर्ड",
    iconKey: "pcb",
    defaultUnit: "KG",
    criticalMinerals: ["gold", "silver", "palladium", "tantalum", "gallium"],
  },
  {
    code: "PANEL",
    nameEn: "LCD or LED panel",
    nameMr: "स्क्रीन",
    nameHi: "स्क्रीन",
    iconKey: "panel",
    defaultUnit: "PIECE",
    criticalMinerals: ["indium"],
  },
  {
    code: "CRT",
    nameEn: "CRT monitor or television",
    nameMr: "जुना टीव्ही",
    nameHi: "पुराना टीवी",
    iconKey: "crt",
    defaultUnit: "PIECE",
    criticalMinerals: ["lead", "yttrium"],
  },
  {
    code: "BATTERY",
    nameEn: "Battery",
    nameMr: "बॅटरी",
    nameHi: "बैटरी",
    iconKey: "battery",
    defaultUnit: "KG",
    criticalMinerals: ["lithium", "cobalt", "nickel", "lead"],
  },
  {
    code: "MOTOR",
    nameEn: "Motor or magnet assembly",
    nameMr: "मोटर",
    nameHi: "मोटर",
    iconKey: "motor",
    defaultUnit: "KG",
    criticalMinerals: ["neodymium", "dysprosium", "copper"],
  },
  {
    code: "PLASTIC",
    nameEn: "Mixed plastic housing",
    nameMr: "प्लास्टिक",
    nameHi: "प्लास्टिक",
    iconKey: "plastic",
    defaultUnit: "KG",
    criticalMinerals: [],
  },
  {
    code: "OTHER",
    nameEn: "Other or mixed",
    nameMr: "इतर",
    nameHi: "अन्य",
    iconKey: "other",
    defaultUnit: "KG",
    criticalMinerals: [],
  },
];

// The four distinctions that set the price and that no photograph can settle.
// The B option in each pair is the LOWER-value sub-type: "I don't know" routes
// there, so uncertainty never inflates the estimate (FRONTEND.md S3).
export const CHILDREN = [
  {
    parent: "PCB",
    code: "PCB_COMPUTER",
    nameEn: "Computer or laptop board",
    nameMr: "कॉम्प्युटर बोर्ड",
    nameHi: "कंप्यूटर बोर्ड",
    iconKey: "pcb-computer",
    defaultUnit: "KG",
    criticalMinerals: ["gold", "palladium", "tantalum"],
  },
  {
    parent: "PCB",
    code: "PCB_APPLIANCE",
    nameEn: "TV or appliance board",
    nameMr: "टीव्ही बोर्ड",
    nameHi: "टीवी बोर्ड",
    iconKey: "pcb-appliance",
    defaultUnit: "KG",
    criticalMinerals: ["copper"],
    lowerValue: true,
  },
  {
    parent: "BATTERY",
    code: "BATTERY_PHONE",
    nameEn: "Phone or laptop battery",
    nameMr: "फोन बॅटरी",
    nameHi: "फोन बैटरी",
    iconKey: "battery-phone",
    defaultUnit: "KG",
    criticalMinerals: ["lithium", "cobalt"],
  },
  {
    parent: "BATTERY",
    code: "BATTERY_INVERTER",
    nameEn: "Inverter or UPS battery",
    nameMr: "इन्व्हर्टर बॅटरी",
    nameHi: "इन्वर्टर बैटरी",
    iconKey: "battery-inverter",
    defaultUnit: "KG",
    criticalMinerals: ["lead"],
    lowerValue: true,
  },
  {
    parent: "PANEL",
    code: "PANEL_LAPTOP",
    nameEn: "Laptop or monitor panel",
    nameMr: "लॅपटॉप स्क्रीन",
    nameHi: "लैपटॉप स्क्रीन",
    iconKey: "panel-laptop",
    defaultUnit: "PIECE",
    criticalMinerals: ["indium"],
  },
  {
    parent: "PANEL",
    code: "PANEL_TV",
    nameEn: "Television panel",
    nameMr: "टीव्ही स्क्रीन",
    nameHi: "टीवी स्क्रीन",
    iconKey: "panel-tv",
    defaultUnit: "PIECE",
    criticalMinerals: ["indium"],
    lowerValue: true,
  },
  {
    parent: "MOTOR",
    code: "MOTOR_HDD",
    nameEn: "Hard disk",
    nameMr: "हार्ड डिस्क",
    nameHi: "हार्ड डिस्क",
    iconKey: "motor-hdd",
    defaultUnit: "KG",
    criticalMinerals: ["neodymium", "dysprosium"],
  },
  {
    parent: "MOTOR",
    code: "MOTOR_FAN",
    nameEn: "Fan or pump motor",
    nameMr: "पंखा मोटर",
    nameHi: "पंखा मोटर",
    iconKey: "motor-fan",
    defaultUnit: "KG",
    criticalMinerals: ["copper"],
    lowerValue: true,
  },
];

// README "Demo data". Coordinates hand-checked against the MPCB addresses,
// closing open item 4 for the eight rows the demo actually routes over. The
// remaining 153 rows keep NULL coordinates and are simply never ranked.
export const DEMO_COORDS = {
  "Lilashana Sales": { lat: 20.7106, lng: 76.5665, serviceAreaKm: 60, pickupAvailable: false },
  "Global E-Recycling": { lat: 19.6967, lng: 72.7699, serviceAreaKm: 40, pickupAvailable: true },
  "Eco Reset": { lat: 21.2181, lng: 79.1968, serviceAreaKm: 40, pickupAvailable: false },
  "Bharat E Waste": { lat: 19.4213, lng: 72.8449, serviceAreaKm: 25, pickupAvailable: true },
  "Aman Trading": { lat: 19.0728, lng: 72.8826, serviceAreaKm: 30, pickupAvailable: false },
  "Eco-Recycling": { lat: 19.3919, lng: 72.8397, serviceAreaKm: 25, pickupAvailable: false },
  "Kohinoor E-Waste": { lat: 18.7906, lng: 73.2686, serviceAreaKm: 40, pickupAvailable: false },
  "Go Green Recycling": { lat: 19.1108, lng: 73.0176, serviceAreaKm: 30, pickupAvailable: true },
};

// Field-collected observations, labelled honestly. Small and
// non-representative: one town, one week, a handful of respondents. Say that
// out loud before a judge does (README ground rule 6).
export const DEMO_RATES = {
  "Lilashana Sales": { CABLE: 380, PCB: 190, BATTERY: 95, MOTOR: 60, PLASTIC: 18, OTHER: 12 },
  "Global E-Recycling": { CABLE: 410, PCB: 205, BATTERY: 88, MOTOR: 65, PLASTIC: 20, OTHER: 14 },
  "Eco Reset": { CABLE: 395, PCB: 198, BATTERY: 92, MOTOR: 58, PLASTIC: 19, OTHER: 13 },
};
