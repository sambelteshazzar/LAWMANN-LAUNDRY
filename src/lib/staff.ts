import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { staff } from '@/lib/db/schema';

/**
 * The door rule, in one place: a staff row logs in when it has a PIN and is
 * still active. Former staff keep every order they ever touched — history
 * never rewrites — but the dropdown, the PIN check, and the session gate all
 * read this rule, so one deactivation closes all three doors at once.
 */

interface StaffRow {
  pinHash: string | null;
  active: boolean;
}

export function rowCanLogIn(row: StaffRow | undefined): row is StaffRow & { pinHash: string } {
  return !!row?.pinHash && row.active;
}

export async function loginEligibleStaff(db: Db): Promise<Array<{ id: string; name: string; role: string }>> {
  return db
    .select({ id: staff.id, name: staff.name, role: staff.role })
    .from(staff)
    .where(and(isNotNull(staff.pinHash), eq(staff.active, true)));
}
