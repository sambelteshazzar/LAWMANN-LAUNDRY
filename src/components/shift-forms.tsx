'use client';

import { useActionState } from 'react';
import { plain } from '@/lib/money';
import { Field, TextInput } from '@/components/ui';
import { FormError, PrimaryButton } from '@/components/form-buttons';
import { closeShiftAction } from '@/app/actions/ops';

/**
 * Closing the drawer: what was counted against what should be there. The
 * variance shows big and unmissable — a short drawer is the first sign of
 * a leak, and leaks compound weekly.
 */
export function CloseShiftForm({ shiftId }: { shiftId: string }) {
  const [state, action] = useActionState(closeShiftAction, { ok: false });
  const close = state.ok ? state.close : undefined;

  if (close) {
    const even = close.variancePesewa === 0;
    return (
      <div className={`rounded-lg border p-4 ${even ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Shift closed</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {close.variancePesewa === 0
            ? 'Drawer is exact.'
            : close.variancePesewa > 0
              ? `+GH¢${plain(close.variancePesewa)} variance`
              : `−GH¢${plain(close.variancePesewa).slice(1)} variance`}
        </p>
        <p className="mt-1 text-sm tabular-nums text-stone-600">
          Counted GH¢{plain(close.countedPesewa)} · expected GH¢{plain(close.expectedPesewa)}
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="shiftId" value={shiftId} />
      <Field label="Cash counted in the drawer (GH¢)" htmlFor="counted">
        <TextInput id="counted" name="counted" inputMode="decimal" required placeholder="e.g. 450" />
      </Field>
      <Field label="MoMo meter reading (optional)" htmlFor="momoAtClose" hint="The balance showing on the MoMo phone, if you track it.">
        <TextInput id="momoAtClose" name="momoAtClose" inputMode="decimal" placeholder="Optional" />
      </Field>
      <FormError error={state.ok ? undefined : state.error} />
      <PrimaryButton>Close shift</PrimaryButton>
    </form>
  );
}
