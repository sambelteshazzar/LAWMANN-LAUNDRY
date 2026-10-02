import { moneyShort, weightLabel, type Grams, type Pesewas } from '@/lib/money';

/**
 * The three messages the proposal promises: bag accepted, ready for
 * collection, payment received. Every template is a single SMS segment
 * (SMS_SEGMENT_LIMIT): each extra segment costs the owner ~GH¢0.022, so
 * length is a design constraint, not a suggestion.
 *
 * Figures come from integer pesewas through moneyShort. No toFixed, no
 * float, anywhere in this file.
 */

export const SMS_SEGMENT_LIMIT = 160;

export interface AcceptedMessageInput {
  name?: string | null;
  weightGrams: Grams;
  grossPesewa: Pesewas;
  /** Everything the student has handed over, claimed or confirmed. The student believes their MoMo. */
  paidAllStatesPesewa: Pesewas;
  orderNo: string;
}

export function acceptedMessage(input: AcceptedMessageInput): string {
  const name = input.name?.trim() || 'you';
  const balance = input.grossPesewa - input.paidAllStatesPesewa;
  return (
    `Lawmann: bag received for ${name}. ` +
    `${weightLabel(input.weightGrams)}, ${moneyShort(input.grossPesewa)}. ` +
    `Balance owing ${moneyShort(balance)}. Order ${input.orderNo}.`
  );
}

export function readyMessage(orderNo: string): string {
  return `Lawmann: your laundry is ready for collection. Order ${orderNo}.`;
}

export function paymentMessage(amountPesewa: Pesewas, orderNo: string, balancePesewa: Pesewas): string {
  return `Lawmann: ${moneyShort(amountPesewa)} received for ${orderNo}. Balance owing ${moneyShort(balancePesewa)}.`;
}
