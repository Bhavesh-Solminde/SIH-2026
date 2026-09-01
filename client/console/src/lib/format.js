const inr = new Intl.NumberFormat("en-IN");

export function rupees(n) {
  if (n === null || n === undefined) return "—";
  return `₹${inr.format(Math.round(Number(n)))}`;
}

export function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

export function shortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
