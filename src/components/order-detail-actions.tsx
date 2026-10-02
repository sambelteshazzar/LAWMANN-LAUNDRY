'use client';

import { useActionState, useState } from 'react';
import { moneyShort } from '@/lib/money';
import { Field, TextInput } from '@/components/ui';
import { DangerButton, FormError, PrimaryButton, SecondaryButton } from '@/components/form-buttons';
import { advanceStatusAction, cancelOrderAction, confirmMomoAction, takePaymentAction } from '@/app/actions/orders';

export function StatusMoveForm({ orderId, to, label, primary }: { orderId: string; to: string; label: string; primary?: boolean }) {
  const [state, action] = useActionState(advanceStatusAction, { ok: true });
  const Button = primary ? PrimaryButton : SecondaryButton;
  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="to" value={to} />
      <FormError error={state.ok ? undefined : state.error} />
      <Button>{label}</Button>
    </form>
  );
}

export function ConfirmMomoForm({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState(confirmMomoAction, { ok: true });
  return (
    <form action={action}>
      <input type="hidden" name="paymentId" value={paymentId} />
      {state.ok ? null : <span className="mr-2 text-xs font-medium text-red-700">{state.error}</span>}
      <button type="submit" className="flex min-h-12 items-center rounded-md bg-green-700 px-3 text-sm font-semibold text-white">
        Confirm
      </button>
    </form>
  );
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(cancelOrderAction, { ok: true });
  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <FormError error={state.ok ? undefined : state.error} />
      <DangerButton>Cancel this order</DangerButton>
    </form>
  );
}

/**
 * Takes a payment against an order: cash or MoMo with the transaction ref.
 * Presets are computed from the balance still owing, not the gross — a
 * second visit offers what is left, not what the bag cost.
 */

export function PaymentForm({ orderId, balancePesewa }: { orderId: string; balancePesewa: number }) {
  const [state, action] = useActionState(takePaymentAction, { ok: true });
  const [method, setMethod] = useState<'cash' | 'momo'>('cash');
  const [amountGhs, setAmountGhs] = useState('');

  const setPreset = (kind: 'full' | 'half') => {
    const pesewa = kind === 'full' ? balancePesewa : Math.round(balancePesewa / 2);
    setAmountGhs((pesewa / 100).toFixed(2).replace(/\.00$/, ''));
  };

  return (
    <form action={action}>
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
      <FormError error={state.ok ? undefined : state.error} />
      <PrimaryButton>Take payment</PrimaryButton>
    </form>
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
