import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { smsMessage } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { EmptyState, Page, PageTitle, Section, StatusBadge } from '@/components/ui';
import { ActionForm, SecondaryButton } from '@/components/form-buttons';
import { sendAllAction } from '@/app/actions/ops';

export const metadata = { title: 'Messages · Lawmann Laundry' };

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The outbox: every message the app owes a student, with its state. Without
 * an Arkesel key nothing sends — and the page says so instead of pretending.
 */
export default async function MessagesPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/orders/new');

  await ensureBooted();
  const messages = await getDb().select().from(smsMessage).orderBy(desc(smsMessage.createdAt)).limit(100);
  const waiting = messages.filter((m) => m.state === 'queued').length;
  const configured = !!process.env.ARKESEL_API_KEY;

  return (
    <Page>
      <PageTitle title="Messages" hint="What each student was told, and whether it left the phone." />
      {!configured ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">SMS gateway not connected</p>
          <p className="mt-1 text-sm text-amber-800">
            {waiting === 0
              ? 'Messages are being recorded and will send once the owner adds the Arkesel key.'
              : `${waiting} ${waiting === 1 ? 'message is' : 'messages are'} waiting — they will send themselves once the owner adds the Arkesel key.`}
          </p>
        </div>
      ) : null}
      {waiting > 0 && configured ? (
        <div className="mb-4">
          <ActionForm action={sendAllAction}>
            <SecondaryButton>Send {waiting} waiting {waiting === 1 ? 'message' : 'messages'}</SecondaryButton>
          </ActionForm>
        </div>
      ) : null}
      {messages.length === 0 ? (
        <EmptyState title="No messages yet." hint="Take a bag and the first “received” message lands here." />
      ) : (
        <Section>
          <ul className="divide-y divide-stone-100">
            {messages.map((m) => (
              <li key={m.id} className="py-2.5">
                <p className="text-sm text-stone-800">{m.body}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums text-stone-500">
                  <StatusBadge status={m.state} />
                  <span>{m.toPhone}</span>
                  <span>{formatDate(m.createdAt)}</span>
                  {m.state === 'failed' && m.error ? <span className="text-red-700">{m.error}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
