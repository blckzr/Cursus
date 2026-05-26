import { db } from '../../config/db';

interface ListFilter {
  action?: string;
  entityType?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

/** Paginated audit-log query with optional filters. Newest first. */
export async function listAuditLogs(filter: ListFilter) {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (filter.action)     { conditions.push(`al.action = $${i++}`);      vals.push(filter.action); }
  if (filter.entityType) { conditions.push(`al.entity_type = $${i++}`); vals.push(filter.entityType); }
  if (filter.actor) {
    conditions.push(`(u.full_name ILIKE $${i} OR u.user_code ILIKE $${i} OR u.email ILIKE $${i})`);
    vals.push(`%${filter.actor}%`); i++;
  }
  if (filter.from) { conditions.push(`al.created_at >= $${i++}`); vals.push(filter.from); }
  if (filter.to)   { conditions.push(`al.created_at <= $${i++}`); vals.push(filter.to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataRes = await db.query(
    `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id,
            al.old_value, al.new_value, al.created_at,
            u.full_name AS user_full_name, u.user_code AS user_user_code, u.role AS user_role
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...vals, filter.limit, filter.offset],
  );

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}`,
    vals,
  );

  return { rows: dataRes.rows, total: countRes.rows[0].total as number };
}

/** Distinct action types currently in the log. Used by the filter dropdown. */
export async function listActionTypes() {
  const { rows } = await db.query(
    `SELECT DISTINCT action FROM audit_logs ORDER BY action`,
  );
  return rows.map((r: { action: string }) => r.action);
}
