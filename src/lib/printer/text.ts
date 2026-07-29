/**
 * Text helpers for thermal (ESC/POS) printing.
 *
 * Thermal printers use a single-byte codepage (PC437 here), not Unicode.
 * Anything outside it is printed as "?", which is why amounts formatted by
 * Intl.NumberFormat came out as "1?500?000": the French locale separates
 * thousands with U+202F (narrow no-break space), not a plain space.
 */

/** Unicode spaces that must become a plain ASCII space */
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Typographic punctuation the printer cannot render */
const PUNCTUATION: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D\u201F]/g, '"'],
  [/[\u2010-\u2015]/g, "-"],
  [/\u2026/g, "..."],
  [/\u00B0/g, "o"],
  [/[\u20A0-\u20BF]/g, ""],
];

/**
 * Makes a string safe for any thermal printer: plain ASCII only.
 * Accents are stripped rather than encoded, because cheap POS clones ignore
 * the codepage command and would print garbage instead.
 */
export function toThermalText(input: string): string {
  let out = input.replace(UNICODE_SPACES, " ");
  for (const [pattern, replacement] of PUNCTUATION) {
    out = out.replace(pattern, replacement);
  }
  // "é" -> "e" + combining accent -> "e"
  out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Drop anything still outside printable ASCII
  return out.replace(/[^\x20-\x7E]/g, "");
}

/**
 * Amount grouped with plain spaces, no currency word: "1 500 000".
 * Built by hand so no locale can inject an exotic separator.
 */
export function formatReceiptAmount(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();

  let grouped = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += " ";
    grouped += digits[i];
  }
  return sign + grouped;
}
