/**
 * Arkesel bulk SMS, the Ghanaian gateway. V2 API:
 * POST with an api-key header and {sender, message, recipients[]};
 * an invalid key returns 401 {"message":"Invalid key","status":"error"}.
 *
 * A missing key is a normal state (dev, and the owner demo before signup),
 * not an error: the caller leaves the message queued and shows it.
 */

export const ARKESEL_ENDPOINT = 'https://sms.arkesel.com/api/v2/sms/send';
export const ARKESEL_SENDER = 'LAWMANN';

export type ArkeselResult = { ok: true; ref?: string } | { ok: false; error: string };

export function arkeselKey(): string | null {
  return process.env.ARKESEL_API_KEY || null;
}

interface ArkeselPayload {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  id?: unknown;
  message_id?: unknown;
}

function errorText(payload: ArkeselPayload, fallback: string): string {
  if (typeof payload.message === 'string' && payload.message.length > 0) return payload.message;
  return fallback;
}

function extractRef(payload: ArkeselPayload): string | undefined {
  const data = payload.data;
  if (typeof data === 'object' && data !== null) {
    const d = data as { id?: unknown; messageId?: unknown; message_id?: unknown };
    if (typeof d.id === 'string') return d.id;
    if (typeof d.messageId === 'string') return d.messageId;
    if (typeof d.message_id === 'string') return d.message_id;
  }
  if (typeof payload.id === 'string') return payload.id;
  if (typeof payload.message_id === 'string') return payload.message_id;
  return undefined;
}

export function toArkeselRecipient(phone: string): string {
  const cleaned = phone.trim().replace(/[\s-]/g, '');
  if (/^0\d{9}$/.test(cleaned)) return `233${cleaned.slice(1)}`;
  if (/^\+233\d{9}$/.test(cleaned)) return cleaned.slice(1);
  return cleaned;
}

export async function sendViaArkesel(phone: string, body: string): Promise<ArkeselResult> {
  const key = arkeselKey();
  if (!key) return { ok: false, error: 'SMS gateway not configured (ARKESEL_API_KEY).' };

  let res: Response;
  try {
    res = await fetch(ARKESEL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({ sender: ARKESEL_SENDER, message: body, recipients: [toArkeselRecipient(phone)] }),
    });
  } catch (err) {
    return { ok: false, error: `SMS gateway unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  let payload: ArkeselPayload = {};
  try {
    payload = (await res.json()) as ArkeselPayload;
  } catch {
    return { ok: false, error: `SMS gateway returned an unreadable response (HTTP ${res.status}).` };
  }

  if (!res.ok || payload.status === 'error') {
    return { ok: false, error: `SMS gateway refused the message: ${errorText(payload, res.statusText)}` };
  }
  return { ok: true, ref: extractRef(payload) };
}
