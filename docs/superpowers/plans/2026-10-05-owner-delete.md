# Owner-only delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner can delete SMS messages and hard-delete staff with no history; counter/collector cannot.

**Architecture:** Two new server actions in existing `ops.ts` / `auth.ts` guarded by `canManageStaff()`, shop-scoped deletes, owner-only buttons in the two pages.

**Tech Stack:** Next.js server actions, Drizzle ORM (Postgres/PGlite), existing ActionForm + buttons.

## Global Constraints

- Collector never sees Messages page (existing redirect stays).
- Counter sees Messages but never sees a delete button; forged requests fail server-side.
- Staff hard-delete is blocked when linked history exists.
- Shop-scoped: every delete includes `eq(shopId, session.shopId)`.

---

### Task 1: Message delete actions + UI

**Files:**
- Modify: `src/app/actions/ops.ts`
- Modify: `src/app/(app)/app/messages/page.tsx`
- Test: `npm test` (existing suite, no new infra)

**Interfaces:**
- Consumes: `requireSession()`, `canManageStaff(role)`, `smsMessage` table, `ActionState`.
- Produces: `deleteMessageAction(prev, formData with messageId) -> ActionState`, `clearSentMessagesAction(prev) -> ActionState`.

- [ ] **Step 1: Add the two actions to `ops.ts`**

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { smsMessage } from '@/lib/db/schema';
import { canManageStaff } from '@/lib/session';

export async function deleteMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner deletes messages.' };
  const messageId = String(formData.get('messageId') ?? '');
  if (!messageId) return { ok: false, error: 'Pick a message first.' };
  await ensureBooted();
  await getDb().delete(smsMessage).where(and(eq(smsMessage.id, messageId), eq(smsMessage.shopId, session.shopId)));
  refreshOps();
  return { ok: true };
}

export async function clearSentMessagesAction(_prev: ActionState): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner clears messages.' };
  await ensureBooted();
  await getDb().delete(smsMessage).where(and(eq(smsMessage.shopId, session.shopId), inArray(smsMessage.state, ['sent', 'failed'])));
  refreshOps();
  return { ok: true };
}
```

- [ ] **Step 2: Show owner-only buttons in `messages/page.tsx`**

```tsx
import { clearSentMessagesAction, deleteMessageAction, sendAllAction } from '@/app/actions/ops';
// sentCount = messages.filter((m) => m.state === 'sent' || m.state === 'failed').length
// if (session.role === 'owner' && sentCount > 0): ActionForm action={clearSentMessagesAction} -> SecondaryButton "Clear {sentCount} sent history"
// per row, if (session.role === 'owner'): ActionForm action={deleteMessageAction} + hidden messageId + small Delete button
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck --if-present || npx tsc --noEmit` and `npm test`
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/ops.ts "src/app/(app)/app/messages/page.tsx"
git commit -m "feat: owner-only message delete"
```

### Task 2: Staff hard-delete with history guard

**Files:**
- Modify: `src/app/actions/auth.ts`
- Modify: `src/app/(app)/app/staff/page.tsx`

**Interfaces:**
- Consumes: `requireSession()`, `canManageStaff(role)`, `staff/orders/payment/shift/orderEvent` tables.
- Produces: `deleteStaffAction(prev, formData with staffId) -> ActionState`.

- [ ] **Step 1: Add `deleteStaffAction` to `auth.ts`**

```ts
export async function deleteStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner manages staff.' };
  const staffId = String(formData.get('staffId') ?? '');
  if (!staffId) return { ok: false, error: 'Pick a staff member first.' };
  if (staffId === session.staffId) return { ok: false, error: 'You cannot delete yourself.' };
  await ensureBooted();
  const db = getDb();
  const rows = await db.select().from(staff).where(and(eq(staff.id, staffId), eq(staff.shopId, session.shopId)));
  const target = rows[0];
  if (!target) return { ok: false, error: 'Staff not found.' };
  if (target.role === 'owner' && target.active) {
    const owners = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.shopId, session.shopId), eq(staff.role, 'owner'), eq(staff.active, true)));
    if (owners.length <= 1) return { ok: false, error: 'The shop needs at least one working owner.' };
  }
  // history guard: any linked row blocks the delete
  // check orders.recordedBy, payment.recordedBy, shift.staffId, orderEvent.staffId limit 1 each
  // if any found: return { ok: false, error: 'They have history — move to former staff instead. History stays.' };
  await db.delete(staff).where(and(eq(staff.id, staffId), eq(staff.shopId, session.shopId)));
  revalidatePath('/app/staff');
  return { ok: true };
}
```

- [ ] **Step 2: Add Delete forever button to Former staff list in `staff/page.tsx`**

```tsx
import { createStaffAction, deleteStaffAction, resetPinAction, setStaffActiveAction } from '@/app/actions/auth';
// Former staff row: keep Bring back form, add second ActionForm action={deleteStaffAction} + hidden staffId + DangerButton "Delete forever"
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/auth.ts "src/app/(app)/app/staff/page.tsx"
git commit -m "feat: owner-only staff hard delete with history guard"
```
