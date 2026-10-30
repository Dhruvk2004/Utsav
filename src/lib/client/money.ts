/** Indian digit grouping without a currency sign: 2500000 -> "25,00,000". */
export function groupIndian(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}

/** A leading "₹", "Rs." or "INR", and a trailing "/-", which people often type around amounts. */
const CURRENCY_MARKS = /^\s*(?:₹|rs\.?|inr)\s*|\s*\/-\s*$/gi;

/**
 * Whole rupees from what the user typed ("25,00,000", "₹ 7,142", "2,400.50" -> 2400; paise are
 * dropped), or null when it is not an amount: empty, a sign, an exponent or any other text (QA-09).
 */
export function parseRupees(text: string): number | null {
  const plain = text.replace(CURRENCY_MARKS, "").replace(/[,\s]/g, "");
  const match = /^(\d*)(?:\.\d*)?$/.exec(plain);
  if (!match || !/\d/.test(plain)) return null;
  return Number(match[1] || "0");
}

/**
 * Re-groups a money field as the user types. Other characters are dropped, but a decimal point and
 * up to two paise digits stay, so typing "2400.50" never turns into ₹2,40,050 (QA-09).
 */
export function formatRupeesInput(text: string): string {
  const [whole, ...fraction] = text.replace(CURRENCY_MARKS, "").split(".");
  const digits = whole.replace(/\D/g, "");
  const paise = fraction.length > 0 ? `.${fraction.join("").replace(/\D/g, "").slice(0, 2)}` : "";
  if (!digits) return paise.length > 1 ? `0${paise}` : "";
  return groupIndian(Number(digits)) + paise;
}

/** "About ₹7,142 per guest", or null until both numbers are usable. */
export function perGuestText(budget: number | null, guests: number | null): string | null {
  if (!budget || !guests || guests < 1) return null;
  return `About ₹${groupIndian(Math.floor(budget / guests))} per guest`;
}
