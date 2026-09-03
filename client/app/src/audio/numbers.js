/**
 * Number-to-clip-name composition.
 *
 * composeNumber(n, lang) → string[]
 *
 * Returns an ordered array of logical clip names that, when played in
 * sequence, speak the number n in the given language ('mr' | 'hi').
 *
 * Supports 0–9999. Both Marathi and Hindi share the same positional logic
 * (thousands → hundreds → tens → ones) because the clip names are the same
 * logical tokens across both languages; the per-language audio files are
 * resolved in clips.js.
 *
 * Examples:
 *   composeNumber(0,  'mr') → ['zero']
 *   composeNumber(5,  'hi') → ['five']
 *   composeNumber(23, 'mr') → ['twenty', 'three']
 *   composeNumber(100,'hi') → ['one', 'hundred']
 *   composeNumber(115,'mr') → ['one', 'hundred', 'ten', 'five']
 *   composeNumber(1500,'hi')→ ['one', 'thousand', 'five', 'hundred']
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine',
];

const TENS = [
  null,       // 0 tens — unused
  'ten',      // 10
  'twenty',   // 20
  'thirty',   // 30
  'forty',    // 40
  'fifty',    // 50
  'sixty',    // 60
  'seventy',  // 70
  'eighty',   // 80
  'ninety',   // 90
];

/**
 * @param {number} n      Integer 0–9999
 * @param {'mr'|'hi'} _lang  Language tag (reserved for future divergence)
 * @returns {string[]}   Ordered array of clip names
 */
export function composeNumber(n, _lang = 'mr') {
  const num = Math.floor(Math.abs(n));

  if (num === 0) {
    return ['zero'];
  }

  const clips = [];
  let remaining = num;

  // Thousands
  if (remaining >= 1000) {
    const thousands = Math.floor(remaining / 1000);
    clips.push(..._composeBelow100(thousands));
    clips.push('thousand');
    remaining = remaining % 1000;
  }

  // Hundreds
  if (remaining >= 100) {
    const hundreds = Math.floor(remaining / 100);
    clips.push(..._composeBelow100(hundreds));
    clips.push('hundred');
    remaining = remaining % 100;
  }

  // Tens and ones
  if (remaining > 0) {
    clips.push(..._composeBelow100(remaining));
  }

  return clips;
}

/**
 * Compose clip names for a number in the range 1–99.
 * @param {number} n
 * @returns {string[]}
 */
function _composeBelow100(n) {
  if (n <= 0) return [];
  if (n < 10) return [ONES[n]];

  const tensDigit = Math.floor(n / 10);
  const onesDigit = n % 10;
  const result = [TENS[tensDigit]];
  if (onesDigit > 0) {
    result.push(ONES[onesDigit]);
  }
  return result;
}
