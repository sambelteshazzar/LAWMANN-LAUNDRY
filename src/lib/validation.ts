import { z } from 'zod';
import { grams } from '@/lib/money';

/**
 * Every action boundary parses through here. Money arrives as decimal GH¢
 * from the browser (what a person types) and is converted to integer
 * pesewas exactly once, in this file, before anything else sees it.
 */

/** Ghana numbers normalize to 10 local digits starting 0; +233 loses its prefix. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s-]/g, '');
  if (/^0\d{9}$/.test(trimmed)) return trimmed;
  if (/^\+233(\d{9})$/.test(trimmed)) return `0${trimmed.slice(4)}`;
  if (/^233(\d{9})$/.test(trimmed)) return `0${trimmed.slice(3)}`;
  return null;
}

/** GH¢ entry -> pesewas. Rejects NaN, negatives, and more than two decimals. */
export function ghsToPesewas(raw: string | number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const scaled = Math.round(raw * 100);
    return Number.isSafeInteger(scaled) && scaled >= 0 ? scaled : null;
  }
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return ghsToPesewas(Number(trimmed));
}

/** kg entry -> grams. Accepts up to three decimals; a scale reads tenths. */
export function kgToGrams(raw: string | number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const scaled = Math.round(raw * 1000);
    return Number.isSafeInteger(scaled) && scaled > 0 ? scaled : null;
  }
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
  return kgToGrams(Number(trimmed));
}

export const loginSchema = z.object({
  staffId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN is 4 to 8 digits.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

const phoneField = z
  .string()
  .min(1, 'Phone number is required.')
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a Ghana phone number, like 0241234567.' });
      return z.NEVER;
    }
    return normalized;
  });

const pesewaField = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const converted = ghsToPesewas(v);
    if (converted === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter an amount like 93 or 93.50.' });
      return z.NEVER;
    }
    return converted;
  });

export const intakeSchema = z.object({
  orderId: z.string().uuid(),
  locationId: z.string().uuid('Choose where the bag was taken.'),
  phone: phoneField,
  name: z.string().trim().max(80).optional().or(z.literal('')),
  room: z.string().trim().max(40).optional().or(z.literal('')),
  weightKg: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const converted = kgToGrams(v);
      if (converted === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Weigh the bag first.' });
        return z.NEVER;
      }
      return converted;
    })
    .refine((g) => g > 0, 'Weight must be more than zero.')
    .refine((g) => g <= grams(200000), 'That weight is impossible for a laundry bag. Re-weigh.'),
  method: z.enum(['band', 'piece']),
  pieces: z
    .array(
      z.object({
        code: z.string(),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .max(30)
    .optional(),
  payment: z
    .object({
      method: z.enum(['cash', 'momo']),
      amount: pesewaField,
      gatewayRef: z.string().trim().min(4, 'The MoMo transaction ref is on the confirmation SMS.').max(60).optional(),
    })
    .nullable(),
  promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type IntakeInput = z.infer<typeof intakeSchema>;

export const paymentSchema = z
  .object({
    orderId: z.string().uuid(),
    method: z.enum(['cash', 'momo']),
    amount: pesewaField,
    gatewayRef: z.string().trim().min(4).max(60).optional(),
  })
  .refine((v) => v.method !== 'momo' || !!v.gatewayRef, {
    message: 'The MoMo transaction ref is on the confirmation SMS.',
    path: ['gatewayRef'],
  });
export type PaymentInput = z.infer<typeof paymentSchema>;

/**
 * The correction form's shape. Weight or total depending on how the order
 * prices, which is the order's own fact, so the mismatch is refused in the
 * lib with the order's own words rather than duplicated here.
 */
export const correctionSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(['band', 'piece']),
  weightKg: z.union([z.string(), z.number()]).optional(),
  totalGhs: z.union([z.string(), z.number()]).optional(),
  phone: phoneField,
  locationId: z.string().uuid('Choose where the bag was taken.'),
  promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the ready date.').optional().or(z.literal('')).default(''),
  note: z.string().trim().min(3, 'Say why the record is changing.').max(120),
});
export type CorrectionInputForm = z.infer<typeof correctionSchema>;

export const COST_CATEGORIES = [
  'gas',
  'electricity',
  'water',
  'detergent',
  'wages',
  'transport',
  'rent',
  'maintenance',
  'other',
] as const;

export const costSchema = z.object({
  category: z.enum(COST_CATEGORIES),
  label: z.string().trim().max(80).optional().or(z.literal('')),
  amount: pesewaField,
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date the bill was paid.'),
});
export type CostInput = z.infer<typeof costSchema>;

export const shiftOpenSchema = z.object({ float: pesewaField });
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

export const shiftCloseSchema = z.object({
  counted: pesewaField,
  momoAtClose: pesewaField.optional(),
});
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

export const staffSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.').max(80),
  role: z.enum(['owner', 'counter', 'collector']),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN is 4 to 8 digits.'),
});
export type StaffInput = z.infer<typeof staffSchema>;
