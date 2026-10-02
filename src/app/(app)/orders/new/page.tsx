import { asc, eq } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { band, location } from '@/lib/db/schema';
import { Page, PageTitle } from '@/components/ui';
import { IntakeForm, type IntakeLists } from '@/components/intake-form';

export const metadata = { title: 'New bag · Lawmann Laundry' };

export default async function NewOrderPage() {
  await ensureBooted();
  const db = getDb();
  const [locations, bands] = await Promise.all([
    db.select({ id: location.id, name: location.name, kind: location.kind }).from(location).where(eq(location.active, true)).orderBy(asc(location.name)),
    db.select({ toGrams: band.toGrams, pricePesewa: band.price }).from(band).where(eq(band.active, true)).orderBy(asc(band.toGrams)),
  ]);
  const lists: IntakeLists = { locations, bands };
  return (
    <Page>
      <PageTitle title="New bag" hint="Student, scale, price, money — in that order." />
      <IntakeForm lists={lists} />
    </Page>
  );
}
