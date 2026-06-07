/**
 * Admin-mediated forgot-password (FUTURE_FEATURES 8.5).
 *
 * Without email integration (8.6), the flow is:
 *
 *   1. User submits `{ userCode }` from the login page → backend creates
 *      a pending `password_reset_requests` row. We DON'T leak whether a
 *      user code exists — same response either way.
 *   2. Every admin gets an in-app notification with a deep link.
 *   3. Admin reviews the request in `/admin/password-resets` and either
 *      approves (password reset to default + `password_must_change=true`)
 *      or denies (with optional note).
 *   4. The user gets a notification telling them the outcome and to log
 *      in with the default password — which lands them on the change-
 *      password gate from FUTURE_FEATURES 6.1.
 */
import bcrypt from 'bcryptjs';
import { db } from '../../config/db';
import { createMany as createNotifications } from '../notifications/notifications.service';

/** Default password admin-resets land on. Synced with the seed. */
const DEFAULT_PASSWORD = '1.PolytechnicU';

/** Rate-limit window per user code, to discourage spamming admin queues. */
const RATE_LIMIT_MS = 60 * 60 * 1000;        // 1 hour

// ─── Public submit (called from the login page) ─────────────────────────────

/**
 * Always succeeds (HTTP 200) — never reveals whether `userCode` exists.
 * Internally, when it does exist and there's no recent request, creates
 * the pending row and notifies every admin.
 */
export async function submitRequest(userCode: string): Promise<{ submitted: true }> {
  const u = await db.query(
    `SELECT id, full_name, role FROM users WHERE user_code = $1 AND is_active = TRUE`,
    [userCode.trim()],
  );
  if (!u.rows[0]) {
    // Same 200 response regardless — don't leak existence.
    return { submitted: true };
  }
  const user = u.rows[0];

  // Already pending? Don't create a dupe — same success response.
  const existing = await db.query(
    `SELECT id FROM password_reset_requests
      WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
    [user.id],
  );
  if (existing.rows[0]) return { submitted: true };

  // Rate-limit: if the last request (any status) was within the window, no-op.
  const recent = await db.query(
    `SELECT requested_at FROM password_reset_requests
      WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
    [user.id],
  );
  if (recent.rows[0] && Date.now() - new Date(recent.rows[0].requested_at).getTime() < RATE_LIMIT_MS) {
    return { submitted: true };
  }

  // Create the request + fan out to admins inside one transaction so a half
  // submitted state can't leave an orphan.
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO password_reset_requests (user_id) VALUES ($1) RETURNING id`,
      [user.id],
    );
    const reqId = r.rows[0].id;

    const admins = await client.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`,
    );
    await createNotifications(
      admins.rows.map((a: { id: string }) => ({
        userId: a.id,
        kind:   'password_reset_requested',
        title:  `Password reset request — ${user.full_name}`,
        body:   `${user.full_name} (${user.role}) requested a password reset. Review in Admin → Password resets.`,
        link:   '/admin/password-resets',
        data:   { requestId: reqId, userId: user.id },
      })),
      client,
    );
    await client.query('COMMIT');
    return { submitted: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Admin queue ────────────────────────────────────────────────────────────

export interface ResetRequestRow {
  id:              string;
  status:          'pending' | 'approved' | 'denied';
  requested_at:    string;
  resolved_at:     string | null;
  user_id:         string;
  user_code:       string | null;
  full_name:       string;
  email:           string;
  role:            string;
  resolver_name:   string | null;
  admin_note:      string | null;
}

export async function listRequests(filter: { status?: 'pending'|'approved'|'denied'|'all' }) {
  const where = filter.status && filter.status !== 'all' ? `WHERE r.status = $1` : '';
  const vals  = filter.status && filter.status !== 'all' ? [filter.status]     : [];
  const r = await db.query(
    `SELECT r.id, r.status, r.requested_at, r.resolved_at, r.admin_note,
            u.id AS user_id, u.user_code, u.full_name, u.email, u.role,
            ra.full_name AS resolver_name
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users ra ON ra.id = r.resolved_by
       ${where}
       ORDER BY r.status = 'pending' DESC, r.requested_at DESC
       LIMIT 200`,
    vals,
  );
  return r.rows as ResetRequestRow[];
}

// ─── Approve / deny ─────────────────────────────────────────────────────────

export async function approveRequest(requestId: string, adminId: string, note?: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT r.id, r.status, r.user_id, u.full_name
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
        WHERE r.id = $1
        FOR UPDATE`,
      [requestId],
    );
    if (!r.rows[0]) throw Object.assign(new Error('Request not found'), { status: 404 });
    if (r.rows[0].status !== 'pending') {
      throw Object.assign(new Error(`This request is already ${r.rows[0].status}.`), { status: 409 });
    }

    // Reset the user's password to the default and flag the change gate.
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await client.query(
      `UPDATE users
          SET password_hash = $1,
              password_must_change = TRUE
        WHERE id = $2`,
      [hash, r.rows[0].user_id],
    );

    // Mark the request resolved.
    await client.query(
      `UPDATE password_reset_requests
          SET status = 'approved',
              resolved_at = now(),
              resolved_by = $1,
              admin_note  = $2
        WHERE id = $3`,
      [adminId, note ?? null, requestId],
    );

    // Audit log.
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'APPROVE_PASSWORD_RESET', 'users', $2, $3)`,
      [adminId, r.rows[0].user_id, JSON.stringify({ requestId })],
    );

    // Notify the user.
    await createNotifications([{
      userId: r.rows[0].user_id,
      kind:   'password_reset_approved',
      title:  'Your password has been reset',
      body:   `Sign in with the default password (${DEFAULT_PASSWORD}) — you'll be asked to change it immediately.`,
      link:   '/login',
      data:   { requestId },
    }], client);

    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function denyRequest(requestId: string, adminId: string, note?: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT id, status, user_id FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    if (!r.rows[0]) throw Object.assign(new Error('Request not found'), { status: 404 });
    if (r.rows[0].status !== 'pending') {
      throw Object.assign(new Error(`This request is already ${r.rows[0].status}.`), { status: 409 });
    }

    await client.query(
      `UPDATE password_reset_requests
          SET status = 'denied',
              resolved_at = now(),
              resolved_by = $1,
              admin_note  = $2
        WHERE id = $3`,
      [adminId, note ?? null, requestId],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'DENY_PASSWORD_RESET', 'users', $2, $3)`,
      [adminId, r.rows[0].user_id, JSON.stringify({ requestId, note: note ?? null })],
    );

    await createNotifications([{
      userId: r.rows[0].user_id,
      kind:   'password_reset_denied',
      title:  'Password reset request denied',
      body:   note ? `Reason: ${note}` : 'Please contact the registrar.',
      link:   null,
      data:   { requestId },
    }], client);

    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
