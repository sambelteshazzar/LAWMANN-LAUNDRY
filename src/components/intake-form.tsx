'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PIECES } from '@/lib/pricing';
import { moneyShort } from '@/lib/money';
import { Field, Money, Section, SelectInput, TextInput } from '@/components/ui';
import { FormError, PrimaryButton } from '@/components/form-buttons';
import { createOrderAction, lookupStudentAction, type StudentLookupResult } from '@/app/actions/orders';

export interface IntakeLists {
  locations: Array<{ id: string; name: string; kind: string }>;
  bands: Array<{ toGrams: number; pricePesewa: number }>;
}

type PayChoice = 'none' | 'cash' | 'momo';

function parseKg(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const g = Math.round(Number(t) * 1000);
  return Number.isSafeInteger(g) && g > 0 ? g : null;
}

function parseGhs(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function IntakeForm({ lists }: { lists: IntakeLists }) {
  const [round, setRound] = useState(0);
  return <IntakeFormInner key={round} lists={lists} onAnother={() => setRound((r) => r + 1)} />;
}

function IntakeFormInner({ lists, onAnother }: { lists: IntakeLists; onAnother: () => void }) {
  const [state, action] = useActionState(createOrderAction, { ok: false });
  const [orderId] = useState(() => crypto.randomUUID());

  const [phone, setPhone] = useState('');
  const [lookup, setLookup] = useState<StudentLookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const lookupSeq = useRef(0);

  const [method, setMethod] = useState<'band' | 'piece'>('band');
  const [weightKg, setWeightKg] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});

  const [payChoice, setPayChoice] = useState<PayChoice>('none');
  const [amountGhs, setAmountGhs] = useState('');

  useEffect(() => {
    const seq = ++lookupSeq.current;
    if (phone.trim().length < 7) {
      setLookup(null);
      setLookingUp(false);
      return;
    }
    setLookingUp(true);
    const timer = setTimeout(async () => {
      try {
        const result = await lookupStudentAction(phone);
        if (lookupSeq.current === seq) setLookup(result);
      } finally {
        if (lookupSeq.current === seq) setLookingUp(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [phone]);

  const grams = parseKg(weightKg);
  const band = grams !== null ? lists.bands.find((b) => grams <= b.toGrams) ?? null : null;
  const overweight = grams !== null && band === null;
  const ceilingKg = lists.bands.length > 0 ? Math.max(...lists.bands.map((b) => b.toGrams)) / 1000 : 15;

  const pieceLines = Object.entries(qty).filter(([, q]) => q > 0);
  const pieceTotal = pieceLines.reduce((acc, [code, q]) => {
    const item = PIECES.find((p) => p.code === code);
    return acc + (item ? item.price * q : 0);
  }, 0);

  const gross = method === 'band' ? band?.pricePesewa ?? null : pieceTotal > 0 ? pieceTotal : null;
  const amountPesewa = parseGhs(amountGhs) ?? 0;
  const balance = gross !== null ? gross - (payChoice === 'none' ? 0 : amountPesewa) : null;

  const setPreset = (kind: 'full' | 'half') => {
    if (gross === null) return;
    const pesewa = kind === 'full' ? gross : Math.round(gross / 2);
    setAmountGhs((pesewa / 100).toFixed(2).replace(/\.00$/, ''));
  };

  if (state.ok && state.orderNo) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-800">Bag recorded</p>
        <p className="mt-2 text-4xl font-bold tabular-nums text-stone-900">{state.orderNo}</p>
        {gross !== null ? (
          <p className="mt-2 text-stone-600">
            {weightKg}kg · {moneyShort(gross)}
            {balance !== null && balance > 0 ? ` · owes ${moneyShort(balance)}` : ' · settled'}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          {state.orderId ? (
            <Link
              href={`/orders/${state.orderId}`}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800"
            >
              View this order
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onAnother}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-teal-700 px-5 font-semibold text-white"
          >
            Take another bag
          </button>
        </div>
      </div>
    );
  }

  const store = lists.locations.filter((l) => l.kind === 'store');
  const campus = lists.locations.filter((l) => l.kind !== 'store');

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="paymentMethod" value={payChoice} />
      <input
        type="hidden"
        name="piecesJson"
        value={JSON.stringify(pieceLines.map(([code, q]) => ({ code, qty: q })))}
      />

      <Section title="1 · Student">
        <Field label="Phone number" htmlFor="phone" hint="The phone identifies the student. Start typing to find them.">
          <TextInput
            id="phone"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="0241234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {lookingUp ? <p className="mb-3 text-sm text-stone-500">Looking up…</p> : null}
        {!lookingUp && lookup?.found ? (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-sm ${
              (lookup.openBalancePesewa ?? 0) > 0 ? 'bg-amber-50 font-medium text-amber-900' : 'bg-green-50 text-green-900'
            }`}
          >
            Returning: {lookup.name ?? 'no name recorded'}
            {lookup.room ? ` · ${lookup.room}` : ''}
            {(lookup.openBalancePesewa ?? 0) > 0
              ? ` — owes ${moneyShort(lookup.openBalancePesewa!)}${lookup.oldestOrderNo ? ` from ${lookup.oldestOrderNo}` : ''}`
              : ' — nothing owing.'}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="name">
            <TextInput id="name" name="name" autoComplete="off" placeholder="Optional" defaultValue={lookup?.name ?? ''} key={lookup?.name ?? 'blank'} />
          </Field>
          <Field label="Room" htmlFor="room">
            <TextInput id="room" name="room" autoComplete="off" placeholder="Optional" defaultValue={lookup?.room ?? ''} key={lookup?.room ?? 'blank'} />
          </Field>
        </div>
      </Section>

      <Section title="2 · Where">
        <Field label="Taken at" htmlFor="locationId">
          <SelectInput id="locationId" name="locationId" required defaultValue="">
            <option value="" disabled>
              Choose the hostel or store
            </option>
            {store.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} (store)
              </option>
            ))}
            {campus.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </Section>

      <Section title="3 · Weigh">
        <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Pricing method">
          {(['band', 'piece'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              className={`min-h-12 rounded-md border text-base font-semibold ${
                method === m ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-stone-300 bg-white text-stone-600'
              }`}
            >
              {m === 'band' ? 'By weight' : 'By item'}
            </button>
          ))}
        </div>
        <Field label="Weight in kilos" htmlFor="weightKg" hint="From the scale. Weigh every bag, even item-priced ones — the cost basis is per kilo.">
          <TextInput
            id="weightKg"
            name="weightKg"
            inputMode="decimal"
            required
            placeholder="e.g. 3.5"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </Field>
        {grams !== null && !overweight && gross !== null ? (
          <p className="mb-1 text-lg text-stone-900">
            <span className="font-bold tabular-nums">{moneyShort(gross)}</span>
            <span className="ml-2 text-sm text-stone-500">
              {method === 'band' && band ? `up to ${band.toGrams / 1000}kg band` : `${pieceLines.reduce((n, [, q]) => n + q, 0)} items`}
            </span>
          </p>
        ) : null}
        {overweight ? (
          <p role="alert" className="mb-1 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            No price covers {grams! / 1000}kg. The price list stops at {ceilingKg}kg — ask the owner before recording this bag.
          </p>
        ) : null}
        {method === 'piece' ? (
          <div className="mt-1">
            <p className="mb-2 text-sm font-semibold text-stone-800">Items</p>
            <ul className="divide-y divide-stone-100">
              {PIECES.map((item) => {
                const q = qty[item.code] ?? 0;
                return (
                  <li key={item.code} className="flex min-h-14 items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{item.name}</p>
                      <p className="text-xs tabular-nums text-stone-500">{moneyShort(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Fewer ${item.name}`}
                        onClick={() => setQty((s) => ({ ...s, [item.code]: Math.max(0, (s[item.code] ?? 0) - 1) }))}
                        className="flex min-h-12 min-w-12 items-center justify-center rounded-md border border-stone-300 text-xl font-bold text-stone-700"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-base font-bold tabular-nums" aria-live="polite">
                        {q}
                      </span>
                      <button
                        type="button"
                        aria-label={`More ${item.name}`}
                        onClick={() => setQty((s) => ({ ...s, [item.code]: Math.min(99, (s[item.code] ?? 0) + 1) }))}
                        className="flex min-h-12 min-w-12 items-center justify-center rounded-md border border-stone-300 text-xl font-bold text-stone-700"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="4 · Payment">
        <div className="mb-3 grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
          {(['none', 'cash', 'momo'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPayChoice(p)}
              aria-pressed={payChoice === p}
              className={`min-h-12 rounded-md border text-base font-semibold ${
                payChoice === p ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-stone-300 bg-white text-stone-600'
              }`}
            >
              {p === 'none' ? 'Later' : p === 'cash' ? 'Cash' : 'MoMo'}
            </button>
          ))}
        </div>
        {payChoice !== 'none' ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setPreset('full')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
                Full{gross !== null ? ` ${moneyShort(gross)}` : ''}
              </button>
              <button type="button" onClick={() => setPreset('half')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
                Half{gross !== null ? ` ${moneyShort(Math.round(gross / 2))}` : ''}
              </button>
              <button type="button" onClick={() => setAmountGhs('')} className="min-h-12 rounded-md border border-stone-300 text-sm font-semibold text-stone-700">
                Custom
              </button>
            </div>
            <Field label="Amount in cedis" htmlFor="paymentAmount">
              <TextInput
                id="paymentAmount"
                name="paymentAmount"
                inputMode="decimal"
                required
                placeholder="e.g. 50"
                value={amountGhs}
                onChange={(e) => setAmountGhs(e.target.value)}
              />
            </Field>
            {payChoice === 'momo' ? (
              <Field label="MoMo transaction ref" htmlFor="gatewayRef" hint="From the MTN confirmation SMS. One transaction settles one order.">
                <TextInput id="gatewayRef" name="gatewayRef" autoComplete="off" required placeholder="e.g. MP260928.1234.A1" />
              </Field>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-stone-500">No money now. The balance follows the bag until collection.</p>
        )}
      </Section>

      <Section title="5 · Confirm">
        <Field label="Ready date (optional)" htmlFor="promisedOn">
          <TextInput id="promisedOn" name="promisedOn" type="date" />
        </Field>
        <dl className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Price</dt>
            <dd className="font-bold tabular-nums">{gross !== null ? moneyShort(gross) : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Paid now</dt>
            <dd className="tabular-nums">{payChoice === 'none' ? moneyShort(0) : amountGhs ? `GH¢${amountGhs}` : '—'}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base">
            <dt className="font-semibold">Still owing</dt>
            <dd className="font-bold tabular-nums">{balance !== null ? moneyShort(Math.max(0, balance)) : '—'}</dd>
          </div>
        </dl>
        <FormError error={state.ok ? undefined : state.error} />
        {state.ok === false && state.orderId && state.orderNo ? (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The bag was recorded as {state.orderNo}, but the payment failed. Take it from{' '}
            <Link href={`/orders/${state.orderId}`} className="font-semibold underline">
              the order page
            </Link>
            .
          </p>
        ) : null}
        {overweight ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-md bg-stone-200 px-5 font-semibold text-stone-500"
          >
            No price — ask the owner
          </button>
        ) : (
          <PrimaryButton>Record this bag</PrimaryButton>
        )}
        {!state.ok && !state.error ? null : !state.ok && !state.orderId ? (
          <p className="mt-2 text-center text-sm text-stone-500">Not saved — tap again to retry. Retries never duplicate the bag.</p>
        ) : null}
      </Section>
    </form>
  );
}
