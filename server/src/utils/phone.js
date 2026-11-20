import { z } from 'zod';

/**
 * Normalises an Indian mobile number to its 10 local digits.
 * Users can type "9829011223", "09829011223", "+91 98290 11223" or
 * "+919829011223" — all of them become "9829011223". Anything else is
 * returned as the raw digits so the validator can reject it.
 */
export function normalizeIndianPhone(value) {
  if (value === undefined || value === null) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidIndianPhone(value) {
  return /^[6-9]\d{9}$/.test(normalizeIndianPhone(value));
}

export function formatIndianPhone(value) {
  const digits = normalizeIndianPhone(value);
  if (!isValidIndianPhone(digits)) return String(value || '').trim();
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export const INDIAN_PHONE_MESSAGE =
  'Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)';

/** Required mobile number: 10 digits, no +91 needed. */
export const indianPhoneSchema = z
  .string()
  .trim()
  .transform(normalizeIndianPhone)
  .refine(isValidIndianPhone, INDIAN_PHONE_MESSAGE);

/** Optional mobile number: empty values are allowed and stay empty. */
export const optionalIndianPhoneSchema = z
  .string()
  .trim()
  .optional()
  .default('')
  .transform(normalizeIndianPhone)
  .refine((value) => value === '' || isValidIndianPhone(value), INDIAN_PHONE_MESSAGE);
