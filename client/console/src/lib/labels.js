// A small en+mr label map — the console is bilingual but does not need the
// app's full i18n machinery. English leads (recyclers read it); Marathi
// supports.
export const LABELS = {
  en: {
    rates: "Rates",
    acceptances: "Incoming",
    verify: "Verify & sign",
    history: "History",
    flags: "Flags",
    login: "Sign in",
    logout: "Sign out",
    publish: "Publish",
    acknowledge: "Acknowledge",
    decline: "Decline",
    inaction_note: "Doing nothing means the collector arrives as planned.",
    final_price: "Final price after inspection",
    inspected_condition: "Condition after inspection",
    downgrade_reason: "Reason for a lower grade",
    submit_handover: "Send to collector",
    awaiting_collector: "Waiting for the collector to confirm",
    estimated: "Estimated",
    published: "Published",
    paid: "Paid",
    within_budget: "Alert rate within target",
    over_budget: "Alert rate above target",
  },
  mr: {
    rates: "भाव",
    acceptances: "आलेले",
    verify: "तपासा",
    history: "इतिहास",
    flags: "इशारे",
    login: "प्रवेश",
    logout: "बाहेर",
    publish: "प्रकाशित करा",
    acknowledge: "स्वीकारले",
    decline: "नाकारले",
    inaction_note: "काही न केल्यास संग्राहक ठरल्याप्रमाणे येईल.",
    final_price: "तपासणीनंतरची किंमत",
    inspected_condition: "तपासणीनंतरची स्थिती",
    downgrade_reason: "कमी दर्जाचे कारण",
    submit_handover: "संग्राहकाला पाठवा",
    awaiting_collector: "संग्राहकाच्या पुष्टीची वाट",
    estimated: "अंदाजे",
    published: "जाहीर",
    paid: "दिले",
    within_budget: "इशारे मर्यादेत",
    over_budget: "इशारे मर्यादेबाहेर",
  },
};

export function t(key, lang = "en") {
  return LABELS[lang]?.[key] ?? LABELS.en[key] ?? key;
}
