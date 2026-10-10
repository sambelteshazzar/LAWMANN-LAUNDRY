'use client';

import { useActionState, useState } from 'react';
import { moneyShort } from '@/lib/money';
import { Field, SelectInput, TextInput } from '@/components/ui';
import { ActionForm, DangerButton, FormError, PrimaryButton, SecondaryButton } from '@/components/form-buttons';
import { advanceStatusAction, cancelOrderAction, confirmMomoAction, takePaymentAction } from '@/app/actions/orders';
import { kgToGrams } from '@/lib/validation';
import { priceAgainstBands } from '@/lib/pricing';
import { correctOrderAction } from '@/app/actions/corrections';

export function StatusMoveForm({ orderId, to, label, primary }: { orderId: string; to: string; label: string; primary?: boolean }) {
  const Button = primary ? PrimaryButton : SecondaryButton;
  return (
    <ActionForm action={advanceStatusAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="to" value={to} />
      <Button>{label}</Button>
    </ActionForm>
  );
}

export function ConfirmMomoForm({ paymentId }: { paymentId: string }) {
  return (
    <ActionForm action={confirmMomoAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <button type="submit" className="flex min-h-12 items-center rounded-md bg-green-700 px-3 text-sm font-semibold text-white">
        Confirm
      </button>
    </ActionForm>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={cancelOrderAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <DangerButton>Cancel this order</DangerButton>
    </ActionForm>
  );
}

/**
 * Takes a payment against an order: cash or MoMo with the transaction ref.
 * Presets are computed from the balance still owing, not the gross — a
 * second visit offers what is left, not what the bag cost.
 */
export function PaymentForm({ orderId, balancePesewa }: { orderId: string; balancePesewa: number }) {
  const [method, setMethod] = useState<'cash' | 'momo'>('cash');
  const [amountGhs, setAmountGhs] = useState('');

  const setPreset = (kind: 'full' | 'half') => {
    const pesewa = kind === 'full' ? balancePesewa : Math.round(balancePesewa / 2);
    setAmountGhs((pesewa / 100).toFixed(2).replace(/\.00$/, ''));
  };

  return (
    <ActionForm action={takePaymentAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="method" value={method} />
      <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Payment method">
        {(['cash', 'momo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            aria-pressed={method === m}
            className={`min-h-12 rounded-md border text-base font-semibold ${
              method === m ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-stone-300 bg-white text-stone-600'
            }`}
          >
            {m === 'cash' ? 'Cash' : 'MoMo'}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => setPreset('full')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
          Full {moneyShort(balancePesewa)}
        </button>
        <button type="button" onClick={() => setPreset('half')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
          Half {moneyShort(Math.round(balancePesewa / 2))}
        </button>
        <button type="button" onClick={() => setAmountGhs('')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
          Custom
        </button>
      </div>
      <Field label="Amount in cedis" htmlFor={`amount-${orderId}`}>
        <TextInput
          id={`amount-${orderId}`}
          name="amount"
          inputMode="decimal"
          required
          placeholder="e.g. 50"
          value={amountGhs}
          onChange={(e) => setAmountGhs(e.target.value)}
        />
      </Field>
      {method === 'momo' ? (
        <Field label="MoMo transaction ref" htmlFor={`gatewayRef-${orderId}`} hint="From the MTN confirmation SMS.">
          <TextInput id={`gatewayRef-${orderId}`} name="gatewayRef" autoComplete="off" required placeholder="e.g. MP260928.1234.A1" />
        </Field>
      ) : null}
      <PrimaryButton>Take payment</PrimaryButton>
    </ActionForm>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800"
    >
      Print receipt
    </button>
  );
}

/**
 * The correction form. One form per order, pre-filled with the record as it
 * stands: the weight or the total depending on how the order prices, the
 * student phone, the pickup point, the ready date, and the one line that
 * rides every audit row. The live price mirrors intake through the same
 * shared tariff, so nobody saves a correction blind.
 */
export function CorrectionForm({
  order,
  studentPhone,
  locationId,
  locations,
  bands,
}: {
  order: { id: string; orderNo: string; method: string; weightGrams: number; gross: number; promisedOn: string };
  studentPhone: string;
  locationId: string;
  locations: Array<{ id: string; name: string }>;
  bands: Array<{ toGrams: number; pricePesewa: number }>;
}) {
  const [state, action] = useActionState(correctOrderAction, { ok: false });
  const isBand = order.method === 'band';
  const [weightKg, setWeightKg] = useState(isBand ? String(order.weightGrams / 1000) : '');
  const [totalGhs, setTotalGhs] = useState(isBand ? '' : String(order.gross / 100));
  const [phone, setPhone] = useState(studentPhone);
  const [location, setLocation] = useState(locationId);
  const [promisedOn, setPromisedOn] = useState(order.promisedOn);
  const [note, setNote] = useState('');

  const grams = weightKg ? kgToGrams(weightKg) : null;
  const quote = isBand && grams !== null ? priceAgainstBands(bands, grams) : null;
  const bandPrice = quote !== null && 'price' in quote ? quote.price : null;
  const overweight = quote !== null && 'missing' in quote;
  const band = grams !== null ? bands.find((b) => Math.floor(grams / 1000) * 1000 <= b.toGrams) ?? null : null;
  const gap = band !== null && grams !== null && grams > band.toGrams;

  if (state.ok && state.summary) {
    return (
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
        {state.summary}. The order now shows the new figures.
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="method" value={order.method} />

      {isBand ? (
        <Field label="Weight in kilos" htmlFor="correct-weight" hint="From the scale. The tariff re-prices it, the tenth-of-a-kilo rule included.">
          <TextInput
            id="correct-weight"
            name="weightKg"
            inputMode="decimal"
            required
            placeholder="e.g. 2.9"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          {bandPrice !== null ? (
            <p className="mb-1 text-lg text-stone-900">
              <span className="font-bold tabular-nums">{moneyShort(bandPrice)}</span>
              <span className="ml-2 text-sm text-stone-500">
                {band ? (gap ? `${band.toGrams / 1000}kg band + GH¢5` : `up to ${band.toGrams / 1000}kg band`) : ''}
              </span>
            </p>
          ) : null}
          {overweight && quote !== null && 'missing' in quote ? (
            <p role="alert" className="mb-1 text-sm font-medium text-red-700">
              {quote.missing}
            </p>
          ) : null}
        </Field>
      ) : (
        <Field label="Total in cedis" htmlFor="correct-total" hint="The whole price of the items in this bag.">
          <TextInput
            id="correct-total"
            name="totalGhs"
            inputMode="decimal"
            required
            placeholder="e.g. 16"
            value={totalGhs}
            onChange={(e) => setTotalGhs(e.target.value)}
          />
        </Field>
      )}

      <Field label="Student phone" htmlFor="correct-phone" hint="The phone identifies the student. A wrong number moves the bag to the right one.">
        <TextInput id="correct-phone" name="phone" inputMode="tel" required placeholder="0241234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>

      <Field label="Taken at" htmlFor="correct-location">
        <SelectInput id="correct-location" name="locationId" required value={location} onChange={(e) => setLocation(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Ready date (optional)" htmlFor="correct-promised">
        <TextInput id="correct-promised" name="promisedOn" type="date" value={promisedOn} onChange={(e) => setPromisedOn(e.target.value)} />
      </Field>

      <Field label="Why is this changing" htmlFor="correct-note" hint="One line. It rides on every correction row in the history.">
        <TextInput id="correct-note" name="note" required maxLength={120} placeholder="scale slipped" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <FormError error={state.ok ? undefined : state.error} />
      <PrimaryButton>Save the correction</PrimaryButton>
    </form>
  );
}
