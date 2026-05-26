import type { PoolClient } from 'pg';
import { db } from '../../config/db';

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
}

/** Pool client *or* transactional client — auto-fired notifications piggyback on the caller's tx. */
type Q = PoolClient | typeof db;

/** Insert one notification. Mostly useful for ad-hoc fires; bulk paths should prefer `createMany`. */
export async function createOne(input: NotificationInput, client: Q = db) {
  const { rows } = await client.query(
    `INSERT INTO notifications (user_id, kind, title, body, link, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.userId, input.kind, input.title,
      input.body ?? null, input.link ?? null,
      input.data ? JSON.stringify(input.data) : null,
    ],
  );
  return rows[0];
}

/**
 * Bulk-insert notifications. Used by the auto-fire paths (finalize / open-term / schedule change)
 * where one event spawns N recipient rows. Skips silently when the list is empty so callers can
 * use it unconditionally inside a transaction.
 */
export async function createMany(items: NotificationInput[], client: Q = db) {
  if (items.length === 0) return 0;

  const values: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const n of items) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(
      n.userId, n.kind, n.title,
      n.body ?? null, n.link ?? null,
      n.data ? JSON.stringify(n.data) : null,
    );
  }
  const { rowCount } = await client.query(
    `INSERT INTO notifications (user_id, kind, title, body, link, data)
     VALUES ${values.join(', ')}`,
    params,
  );
  return rowCount ?? 0;
}

/** Most recent N notifications for one user. */
export async function listForUser(userId: string, opts: { limit: number; unreadOnly: boolean }) {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (opts.unreadOnly) conditions.push('read_at IS NULL');
  params.push(opts.limit);
  const { rows } = await db.query(
    `SELECT id, kind, title, body, link, data, read_at, created_at
     FROM notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** Bell-badge count of unread notifications. */
export async function unreadCount(userId: string) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return rows[0].n as number;
}

/** Mark one notification read. Only succeeds when the row belongs to the caller. */
export async function markRead(userId: string, id: string) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = now()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
  return rowCount ?? 0;
}

/** Mark every unread notification for the user as read. */
export async function markAllRead(userId: string) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return rowCount ?? 0;
}
