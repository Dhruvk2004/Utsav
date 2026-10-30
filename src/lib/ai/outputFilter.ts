/**
 * The deterministic output filter (spec 6.12). It removes only what patterns can find: phone
 * numbers, emails, URLs and bare domains, `@handles`, and capitalised names ending in a business
 * suffix, unless that name appears in the user's own text. It does not claim to catch every
 * invented proper noun; prompt rules and the eval set cover the rest.
 */

export interface Filtered {
  text: string;
  /** Something was removed, so the UI says "Some details were removed". */
  filtered: boolean;
}

const BUSINESS_SUFFIXES = [
  "Pvt Ltd",
  "Pvt. Ltd.",
  "Private Limited",
  "Ltd",
  "LLP",
  "& Sons",
  "& Co",
  "Enterprises",
  "Caterers",
  "Decorators",
  "Studios",
  "Events",
];
const suffix = BUSINESS_SUFFIXES.map((s) => s.replace(/[.&]/g, (c) => `\\${c}`)).join("|");

const PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\bhttps?:\/\/\S+/gi,
  /\bwww\.\S+/gi,
  /\b[a-z0-9-]+\.(?:com|in|co\.in|net|org|io|shop|store|biz)\b(?:\/\S*)?/gi,
  /(?<![\w@])@[A-Za-z0-9_.]{2,}/g,
];

/** Indian and international phone numbers: 10 or more digits, with optional spaces, dashes and `+`. */
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
const digitCount = (text: string) => text.replace(/\D/g, "").length;

const BUSINESS = new RegExp(`(?:[A-Z][\\w'’]*\\s+){1,4}(?:${suffix})\\b\\.?`, "g");

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Filters one AI text; `userText` is what the user typed, whose business names stay. */
export function outputFilter(text: string, userText: readonly string[] = []): Filtered {
  const allowed = userText.join("\n").toLowerCase();
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, "");
  out = out.replace(PHONE, (match) => (digitCount(match) >= 10 ? "" : match));
  out = out.replace(BUSINESS, (match, offset: number, whole: string) => {
    if (allowed.includes(match.trim().toLowerCase())) return match;
    // At the start of a sentence the first capital is usually a verb ("Book Lotus Decorators"), so it stays.
    const words = match.trim().split(/\s+/);
    const sentenceStart = /(^|[.!?]\s*)$/.test(whole.slice(0, offset));
    return sentenceStart && words.length > 2 ? `${words[0]} ` : "";
  });
  const filtered = out !== text;
  return { text: filtered ? tidy(out) : text, filtered };
}

/**
 * A filter that remembers whether anything was removed across many texts (one proposal or draft).
 */
export function textFilter(userText: readonly string[]): { clean: (text: string) => string; readonly filtered: boolean } {
  let filtered = false;
  return {
    clean(text: string) {
      const result = outputFilter(text, userText);
      filtered ||= result.filtered;
      return result.text;
    },
    get filtered() {
      return filtered;
    },
  };
}
