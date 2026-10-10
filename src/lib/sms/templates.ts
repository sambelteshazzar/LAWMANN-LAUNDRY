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
    `LAWMANN: bag received for ${name}. ` +
    `${weightLabel(input.weightGrams)}, ${moneyShort(input.grossPesewa)}. ` +
    `Balance owing ${moneyShort(balance)}. Order ${input.orderNo}.`
  );
}

export function readyMessage(orderNo: string): string {
  return `LAWMANN: your laundry is ready for collection. Order ${orderNo}.`;
}

export function paymentMessage(amountPesewa: Pesewas, orderNo: string, balancePesewa: Pesewas): string {
  return `LAWMANN: ${moneyShort(amountPesewa)} received for ${orderNo}. Balance owing ${moneyShort(balancePesewa)}.`;
}

/**
 * The amended text. The order number leads, because that is the thing the
 * student copied down. The weight is dropped for piece-priced orders, which
 * have no weight price. A negative balance is a refund owed, not a balance.
 */
export function correctedMessage(orderNo: string, weight: string | null, grossPesewa: Pesewas, balancePesewa: Pesewas): string {
  const what = weight ? `corrected to ${weight}, ${moneyShort(grossPesewa)}` : `corrected to ${moneyShort(grossPesewa)}`;
  const balance =
    balancePesewa > 0
      ? `Balance owing ${moneyShort(balancePesewa)}.`
      : balancePesewa < 0
        ? `Refund due ${moneyShort(-balancePesewa)}.`
        : 'Paid in full.';
  return `LAWMANN: order ${orderNo} ${what}. ${balance}`;
}
