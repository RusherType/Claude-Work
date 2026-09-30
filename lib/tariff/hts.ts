/**
 * HTS code helpers. Codes are stored as digits only ("6109100012")
 * and displayed grouped ("6109.10.0012") — see docs/06-schema.md.
 */

const VALID_LENGTHS = new Set([4, 6, 8, 10]);

/** Strip dots and spaces. Returns null if the result is not a 4, 6, 8 or 10 digit code. */
export function normalizeHts(input: string): string | null {
  const digits = input.replace(/[\s.]/g, "");
  if (!/^\d+$/.test(digits) || !VALID_LENGTHS.has(digits.length)) return null;
  return digits;
}

/** Format a stored code for display: 6109 / 6109.10 / 6109.10.00 / 6109.10.0012 */
export function formatHts(code: string): string {
  const digits = normalizeHts(code);
  if (!digits) throw new Error(`Invalid HTS code: "${code}"`);
  if (digits.length === 4) return digits;
  if (digits.length === 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

/** The first 6 digits are the internationally shared HS subheading. */
export function hsSubheading(code: string): string {
  const digits = normalizeHts(code);
  if (!digits || digits.length < 6)
    throw new Error(`Need at least 6 digits: "${code}"`);
  return digits.slice(0, 6);
}
