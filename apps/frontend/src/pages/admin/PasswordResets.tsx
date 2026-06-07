/**
 * Admin → Password resets
 *
 * Queue of forgot-password requests submitted from the login page. Admin
 * approves (password reset to default + first-login change gate) or denies
 * (optional note that the user sees in their notifications).
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPasswordResets, approvePasswordReset, denyPasswordReset,
  type ResetRequestRow,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';
import { InputField } from '../../components/FormField';

type Filter = 'pending' | 'approved' | 'denied' | 'all';

export default function AdminPasswordResets() {
  const [filter, setFilter] = useState<Filter>('pending');
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['password-resets', filter],
    queryFn:  () => listPasswordResets(filter),
  });

  const counts = useMemo(() => ({
    pending:  rows.filter((r: ResetRequestRow) => r.status === 'pending').length,
    approved: rows.filter((r: ResetRequestRow) => r.status === 'approved').length,
    denied:   rows.filter((r: ResetRequestRow) => r.status === 'denied').length,
    total:    rows.length,
  }), [rows]);

  return (
    <div>
      <PageHeader
        eyebrow="Authentication"
        title="Password resets"
        subtitle="Forgot-password requests submitted from the login page. Approving resets the password to the default and forces a change on first login."
        stats={[
          { label: 'Showing', value: rows.length,   icon: 'inbox' },
        ]}
      />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Chip active={filter === 'pending'}  onClick={() => setFilter('pending')}>Pending ({counts.pending})</Chip>
        <Chip active={filter === 'approved'} onClick={() => setFilter('approved')}>Approved</Chip>
        <Chip active={filter === 'denied'}   onClick={() => setFilter('denied')}>Denied</Chip>
        <Chip active={filter === 'all'}      onClick={() => setFilter('all')}>All</Chip>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon={filter === 'pending' ? 'check' : 'inbox'}
            title={filter === 'pending' ? 'Inbox zero' : 'No requests'}
            message={filter === 'pending' ? 'No password-reset requests waiting.' : 'No requests match this filter.'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r: ResetRequestRow) => <RequestCard key={r.id} req={r} />)}
        </div>
      )}
    </div>
  );
}

function RequestCard({ req }: { req: ResetRequestRow }) {
  const [mode, setMode] = useState<'idle' | 'approve' | 'deny'>('idle');

  const badgeCls =
    req.status === 'pending'  ? 'badge-amber'
    : req.status === 'approved' ? 'badge-completed'
    : 'badge-dropped';
  const badgeIcon =
    req.status === 'pending'  ? 'clock'
    : req.status === 'approved' ? 'check'
    : 'x';

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          req.role === 'admin'   ? 'bg-olive-100 dark:bg-olive-500/30 text-olive-600 dark:text-olive-100'
          : req.role === 'faculty' ? 'bg-khaki-100 dark:bg-khaki-300/30 text-khaki-600 dark:text-khaki-100'
          : 'bg-beige-200 dark:bg-stone-700 text-stone-600 dark:text-stone-200'
        }`}>
          <Icon name="user" size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 truncate">{req.full_name}</span>
            <span className="badge badge-neutral text-[10px] uppercase">{req.role}</span>
            <span className={`badge ${badgeCls} text-[10px]`}>
              <Icon name={badgeIcon} size={10} /> {req.status}
            </span>
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span className="font-mono">{req.user_code ?? '—'}</span>
            <span className="hidden sm:inline">·</span>
            <span className="truncate">{req.email}</span>
          </div>
          <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 uppercase tracking-wider">
            Requested {new Date(req.requested_at).toLocaleString()}
            {req.resolved_at && req.resolver_name && (
              <> · resolved by {req.resolver_name} at {new Date(req.resolved_at).toLocaleString()}</>
            )}
          </div>
          {req.admin_note && (
            <div className="text-xs text-stone-600 dark:text-stone-300 bg-beige-50 dark:bg-stone-800 border border-beige-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5 mt-2">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mr-1.5">Note:</span>
              {req.admin_note}
            </div>
          )}
        </div>

        {req.status === 'pending' && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button className="btn-ghost text-xs border border-khaki-200 dark:border-stone-700 flex items-center gap-1.5"
              onClick={() => setMode('deny')}>
              <Icon name="x" size={11} /> Deny
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5"
              onClick={() => setMode('approve')}>
              <Icon name="check" size={12} /> Approve
            </button>
          </div>
        )}
      </div>

      {mode !== 'idle' && (
        <ResolveModal req={req} mode={mode} onClose={() => setMode('idle')} />
      )}
    </div>
  );
}

function ResolveModal({ req, mode, onClose }: {
  req: ResetRequestRow; mode: 'approve' | 'deny'; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: () => mode === 'approve'
      ? approvePasswordReset(req.id, note || undefined)
      : denyPasswordReset(req.id, note || undefined),
    onSuccess: () => {
      toast.push({
        tone: mode === 'approve' ? 'success' : 'info',
        title: mode === 'approve' ? 'Password reset to default' : 'Request denied',
        message: mode === 'approve'
          ? `${req.full_name} can now sign in with the default password.`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ['password-resets'] });
      onClose();
    },
    onError: (e: unknown) => setErr(parseApiError(e).message),
  });

  return (
    <Modal
      title={mode === 'approve' ? 'Approve password reset' : 'Deny request'}
      subtitle={`${req.full_name} (${req.user_code ?? '—'})`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {mode === 'approve' ? (
          <div className="bg-amber-50 dark:bg-amber-400/15 border border-amber-200 dark:border-amber-400/40 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <Icon name="alert-triangle" size={12} className="mt-0.5 flex-shrink-0" />
            <div>
              The user's password will be reset to <span className="font-mono font-semibold">1.PolytechnicU</span> and
              they'll be forced to change it on their next login.
            </div>
          </div>
        ) : (
          <div className="bg-beige-50 dark:bg-stone-800 border border-beige-200 dark:border-stone-700 rounded-lg p-3 text-xs text-stone-600 dark:text-stone-300 flex items-start gap-2">
            <Icon name="info" size={12} className="mt-0.5 flex-shrink-0" />
            <div>The user will see your note (if any) in their notifications.</div>
          </div>
        )}

        <InputField
          label="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={mode === 'approve' ? "Optional — visible in the user's notification." : "Optional — reason for denial."}
        />

        {err && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-400/40 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={mode === 'approve' ? 'btn-primary' : 'btn-danger'}
            onClick={() => { setErr(''); mut.mutate(); }}
            disabled={mut.isPending}
          >
            {mut.isPending ? 'Working…' : mode === 'approve' ? 'Approve + reset password' : 'Deny request'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
