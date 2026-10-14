import { moneyShort, weightLabel, type Grams, type Pesewas } from '@/lib/money';

/**
 * The messages the proposal promises: bag accepted, ready for
 * delivery, payment received, order corrected. Every template is a single SMS
 * segment (SMS_SEGMENT_LIMIT): each extra segment costs the owner ~GH¢0.022, so
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

export interface ReadyOrder {
  readonly method: 'band' | 'piece';
  readonly weightGrams: Grams;
  readonly items: ReadonlyArray<{ name: string; qty: number }>;
}

/** "2 shirts", "1 bedsheet", "1 2-piece suit". The plural is a plain s. */
function itemLabel(name: string, qty: number): string {
  const word = name.toLowerCase();
  return `${qty} ${word}${qty > 1 ? 's' : ''}`;
}

/** "1 bag, 3.5kg" for a weighed bag; "3 items: 2 shirts, 1 trouser" for a counted one. */
function whatIsReady(order: ReadyOrder): string {
  if (order.items.length === 0) return `1 bag, ${weightLabel(order.weightGrams)}`;
  const count = order.items.reduce((n, i) => n + i.qty, 0);
  return `${count} ${count === 1 ? 'item' : 'items'}: ${order.items.map((i) => itemLabel(i.name, i.qty)).join(', ')}`;
}

/**
 * The ready text, in the owner's words: "your laundry is ready for delivery",
 * then what is in the bag and what it costs. The order number closes, because
 * that is the thing the student copied down at intake.
 *
 * A weighed bag has no item list, so it is described as one bag and its
 * weight, which is the honest description. A long counted list is dropped to
 * its first lines until the body fits one segment: each extra segment costs
 * the owner money, so length is a design constraint, not a suggestion.
 */
export function readyMessage(orderNo: string, order: ReadyOrder, grossPesewa: Pesewas): string {
  const head = `LAWMANN: your laundry is ready for delivery.`;
  const price = ` ${moneyShort(grossPesewa)}. Order ${orderNo}.`;
  const what = whatIsReady(order);

  const full = `${head} ${what}.${price}`;
  if (full.length <= SMS_SEGMENT_LIMIT || order.items.length === 0) return full;

  const lines = [...order.items];
  while (lines.length > 0) {
    lines.pop();
    const shorter = `${head} ${whatIsReady({ ...order, items: lines })}.${price}`;
    if (shorter.length <= SMS_SEGMENT_LIMIT) return shorter;
  }
  return `${head}${price}`;
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
