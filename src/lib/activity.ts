import { moneyShort, weightLabel } from '@/lib/money';
import type { Db } from '@/lib/db';

/**
 * Everything that happened at the shop, one chronological feed. Derived live
 * by UNION over the real tables — orders, status events, payments, costs,
 * shifts, messages — so it cannot drift out of sync, because it is the data.
 * Costs carry no actor: operating_cost records no recorder by design, and the
 * feed shows the entry rather than inventing one.
 */

export type ActivityKind = 'order' | 'status' | 'payment' | 'cost' | 'shift' | 'sms';

export interface ActivityFilter {
  day?: Date;
  staffId?: string;
  kind?: ActivityKind;
  limit?: number;
}

export interface ActivityItem {
  at: Date;
  kind: ActivityKind;
  who: string | null;
  text: string;
  orderId: string | null;
}

interface FeedRow {
  at: Date;
  kind: ActivityKind;
  actor_id: string | null;
  actor_name: string | null;
  order_id: string | null;
  order_no: string | null;
  student_name: string | null;
  location_name: string | null;
  weight_grams: number | null;
  amount_pesewa: string | number | null;
  detail: string | null;
}

const UNION = `
  SELECT o.created_at AS at, 'order' AS kind, s.id AS actor_id, s.name AS actor_name,
    o.id AS order_id, o.order_no, st.name AS student_name, l.name AS location_name,
    o.weight_grams, o.gross_pesewa AS amount_pesewa, NULL::text AS detail
  FROM orders o
  LEFT JOIN staff s ON s.id = o.recorded_by
  LEFT JOIN student st ON st.id = o.student_id
  LEFT JOIN location l ON l.id = o.location_id
  WHERE o.shop_id = $1
  UNION ALL
  SELECT e.at, 'status', s.id, s.name, e.order_id, o.order_no,
    NULL, NULL, NULL, NULL, e.from_status::text || ' → ' || e.to_status::text
  FROM order_event e
  JOIN orders o ON o.id = e.order_id
  JOIN staff s ON s.id = e.staff_id
  WHERE o.shop_id = $1
  UNION ALL
  SELECT p.paid_at, 'payment', s.id, s.name, p.order_id, o.order_no,
    st.name, NULL, NULL, p.amount_pesewa, p.method::text || ' ' || p.state::text
  FROM payment p
  JOIN orders o ON o.id = p.order_id
  LEFT JOIN staff s ON s.id = p.recorded_by
  LEFT JOIN student st ON st.id = o.student_id
  WHERE o.shop_id = $1
  UNION ALL
  SELECT (c.incurred_on AT TIME ZONE 'UTC'), 'cost', NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, c.amount_pesewa, COALESCE(c.label, c.category::text)
  FROM operating_cost c
  WHERE c.shop_id = $1
  UNION ALL
  SELECT sh.opened_at, 'shift', s.id, s.name,
    NULL, NULL, NULL, NULL, NULL, sh.float_pesewa, 'opened'
  FROM shift sh
  JOIN staff s ON s.id = sh.staff_id
  WHERE s.shop_id = $1
  UNION ALL
  SELECT sh.closed_at, 'shift', s.id, s.name,
    NULL, NULL, NULL, NULL, NULL, sh.counted_pesewa, 'closed'
  FROM shift sh
  JOIN staff s ON s.id = sh.staff_id
  WHERE s.shop_id = $1 AND sh.closed_at IS NOT NULL
  UNION ALL
  SELECT m.created_at, 'sms', NULL, NULL, m.order_id, o.order_no,
    NULL, NULL, NULL, NULL, m.kind::text || ' to ' || m.to_phone || ' (' || m.state::text || ')'
  FROM sms_message m
  LEFT JOIN orders o ON o.id = m.order_id
  WHERE m.shop_id = $1
`;

function formatItem(r: FeedRow): ActivityItem {
  const who = r.actor_name ?? 'Someone';
  let text: string;
  switch (r.kind) {
    case 'order':
      text =
        `${who} recorded ${weightLabel(Number(r.weight_grams ?? 0))} ` +
        `${moneyShort(Number(r.amount_pesewa ?? 0))} → ${r.order_no} ` +
        `(${r.student_name ?? 'unknown student'}, ${r.location_name ?? 'unknown place'})`;
      break;
    case 'status':
      text = `${who} marked ${r.order_no} ${r.detail ?? ''}`.trim();
      break;
    case 'payment':
      text = `${who} took ${moneyShort(Number(r.amount_pesewa ?? 0))} ${r.detail ?? ''} ${r.order_no}`;
      break;
    case 'cost':
      text = `Cost entered: ${r.detail ?? 'cost'} ${moneyShort(Number(r.amount_pesewa ?? 0))}`;
      break;
    case 'shift':
      text =
        r.detail === 'opened'
          ? `${who} opened shift, float ${moneyShort(Number(r.amount_pesewa ?? 0))}`
          : `${who} closed shift, counted ${moneyShort(Number(r.amount_pesewa ?? 0))}`;
      break;
    case 'sms':
      text = `SMS ${r.detail ?? ''}`.trim();
      break;
  }
  return { at: r.at, kind: r.kind, who: r.actor_name, text, orderId: r.order_id };
}

export async function activityFeed(db: Db, shopId: string, filter: ActivityFilter = {}): Promise<ActivityItem[]> {
  const params: Array<string | number> = [shopId];
  const wheres: string[] = [];
  if (filter.day) {
    const start = new Date(Date.UTC(filter.day.getUTCFullYear(), filter.day.getUTCMonth(), filter.day.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    params.push(start.toISOString(), end.toISOString());
    wheres.push(`at >= $${params.length - 1} AND at < $${params.length}`);
  }
  if (filter.staffId) {
    params.push(filter.staffId);
    wheres.push(`actor_id = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    wheres.push(`kind = $${params.length}`);
  }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  params.push(limit);

  const { rows } = await db.$client.query<FeedRow>(
    `SELECT * FROM (${UNION}) AS feed ${wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''} ORDER BY at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(formatItem);
}
