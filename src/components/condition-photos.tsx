'use client';

import { useActionState, useRef, useState } from 'react';
import { Field, TextInput } from '@/components/ui';
import { FormError, PrimaryButton } from '@/components/form-buttons';
import { addConditionPhotoAction } from '@/app/actions/condition';
import { MAX_PHOTO_CHARS } from '@/lib/condition';

/**
 * The camera control. A file input with `capture` opens the phone's camera
 * and nothing else; on a desktop it is an ordinary file picker. The image is
 * downscaled here, in the browser, to a longest edge of 1000px, because a
 * 12-megapixel photograph is evidence of nothing the shop needs and costs
 * the owner a slow page.
 */

const MAX_EDGE = 1000;
const QUALITY = 0.7;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the photograph.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function ConditionCamera({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(addConditionPhotoAction, { ok: false });
  const [image, setImage] = useState('');
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem('');
    try {
      const base64 = await shrink(file);
      if (base64.length > MAX_PHOTO_CHARS) {
        setProblem('That photograph is too large. Take a closer shot.');
        return;
      }
      setImage(base64);
      setPreview(`data:image/jpeg;base64,${base64}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That photograph could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setImage('');
    setPreview('');
    setNote('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
        Photograph saved. It stays with the order as the record of how the item arrived.
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="image" value={image} />

      <Field label="Photograph the item" htmlFor={`photo-${orderId}`} hint="Opens the camera. One shot, close to the stain.">
        <input
          ref={fileRef}
          id={`photo-${orderId}`}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => void take(e.target.files?.[0])}
          className="w-full min-h-12 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-stone-100 file:px-4 file:text-sm file:font-semibold file:text-stone-800"
        />
      </Field>

      {preview ? (
        <div className="mb-4">
          {/* A base64 src goes through no image optimizer, so the plain img is deliberate. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="The item as it arrived" className="max-h-64 rounded-md border border-stone-200" />
        </div>
      ) : null}

      <Field label="What is wrong with it" htmlFor={`note-${orderId}`} hint="One line. It is what makes the photograph evidence.">
        <TextInput
          id={`note-${orderId}`}
          name="note"
          required
          maxLength={120}
          placeholder="ink on the collar"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <FormError error={problem || (state.ok ? undefined : state.error)} />
      {image ? (
        <div className="flex flex-col gap-2">
          <PrimaryButton>Save the photograph</PrimaryButton>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800"
          >
            Take another
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-500">Take the photograph first.</p>
      )}
    </form>
  );
}
