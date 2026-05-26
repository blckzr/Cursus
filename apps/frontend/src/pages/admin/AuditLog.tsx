import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, getAuditLogActions } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import DataTable, { type DataTableHeader } from '../../components/DataTable';
import TableSkeleton from '../../components/TableSkeleton';
import SearchInput from '../../components/SearchInput';
import Modal from '../../components/Modal';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';

const HEADERS: DataTableHeader[] = [
  { label: 'Time' },
  { label: 'Actor' },
  { label: 'Action' },
  { label: 'Entity' },
  { label: '', align: 'right', width: 60 },
];

// Friendly labels + badge styles per action
const ACTION_META: Record<string, { label: string; badge: string }> = {
  UPDATE_SCORE:    { label: 'Score updated',     badge: 'badge-faculty'   },
  FINALIZE_GRADE:  { label: 'Grade finalized',   badge: 'badge-completed' },
  OPEN_TERM:       { label: 'Term opened',       badge: 'badge-completed' },
  PROMOTE_YEAR:    { label: 'Year promoted',     badge: 'badge-completed' },
  UPDATE_PROFILE:  { label: 'Profile updated',   badge: 'badge-neutral'   },
  CHANGE_PASSWORD: { label: 'Password changed',  badge: 'badge-neutral'   },
};

function timeAgo(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)     return `${Math.floor(diff)}s ago`;
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

const PAGE_SIZE = 50;

interface Row {
  id: string;
  user_id: string | null;
  user_full_name: string | null;
  user_user_code: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export default function AuditLog() {
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);

  // Reset to page 0 whenever a filter changes
  const filterKey = `${actor}|${action}|${from}|${to}`;
  useMemo(() => { setPage(0); }, [filterKey]);

  const { data, isLoading } = useQuery<{ rows: Row[]; total: number }>({
    queryKey: ['audit-logs', { actor, action, from, to, page }],
    queryFn:  () => getAuditLogs({
      actor:      actor || undefined,
      action:     action || undefined,
      from:       from   ? new Date(from).toISOString() : undefined,
      to:         to     ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      limit:      PAGE_SIZE,
      offset:     page * PAGE_SIZE,
    }),
  });

  const { data: actionTypes = [] } = useQuery<string[]>({
    queryKey: ['audit-log-actions'],
    queryFn:  getAuditLogActions,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const clearFilters = () => { setActor(''); setAction(''); setFrom(''); setTo(''); };
  const hasFilters = !!(actor || action || from || to);

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="Activity log"
        subtitle="Every state-changing action across the system, newest first. Used for audit trails."
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput
          value={actor}
          onChange={setActor}
          placeholder="Search actor (name / code / email)…"
          className="w-72"
        />
        <select className="input !w-auto" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actionTypes.map(a => (
            <option key={a} value={a}>{ACTION_META[a]?.label ?? a}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input !w-auto !py-1" />
          <span>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input !w-auto !py-1" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="btn-ghost text-xs">Clear filters</button>
        )}
        <span className="text-xs text-stone-400 ml-auto tabular">
          {isLoading ? '…' : `${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton headers={HEADERS} rows={10} />
      ) : rows.length === 0 ? (
        <div className="card p-0">
          <EmptyState icon="inbox" title="No matching entries"
            message={hasFilters ? 'Try clearing your filters.' : 'No system activity recorded yet.'} />
        </div>
      ) : (
        <DataTable headers={HEADERS}>
          {rows.map(r => {
            const meta = ACTION_META[r.action] ?? { label: r.action, badge: 'badge-neutral' };
            return (
              <tr key={r.id} className="hover:bg-beige-50 transition-colors">
                <td className="table-td">
                  <div className="text-xs text-stone-700" title={new Date(r.created_at).toLocaleString()}>
                    {timeAgo(r.created_at)}
                  </div>
                </td>
                <td className="table-td">
                  {r.user_id ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={r.user_full_name ?? '?'} size={24} tone="beige" />
                      <div className="leading-tight">
                        <div className="text-xs font-medium text-stone-800 truncate max-w-[160px]">{r.user_full_name ?? '—'}</div>
                        <div className="text-[10px] text-stone-400 font-mono">{r.user_user_code ?? '—'}</div>
                      </div>
                    </div>
                  ) : <span className="text-stone-400 text-xs">System</span>}
                </td>
                <td className="table-td">
                  <span className={`badge ${meta.badge}`}>{meta.label}</span>
                </td>
                <td className="table-td">
                  <div className="leading-tight">
                    <div className="text-xs text-stone-700">{r.entity_type}</div>
                    {r.entity_id && (
                      <div className="text-[10px] text-stone-400 font-mono truncate max-w-[180px]">{r.entity_id}</div>
                    )}
                  </div>
                </td>
                <td className="table-td text-right">
                  {(r.old_value != null || r.new_value != null) && (
                    <button className="btn-icon ml-auto" onClick={() => setDetail(r)} title="View details">
                      <Icon name="more" size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-stone-500">
          <span className="tabular">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="chevron-left" size={12} /> Prev
            </button>
            <span className="text-xs tabular">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page + 1 >= totalPages}
              className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <Icon name="chevron-right" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal
          title={ACTION_META[detail.action]?.label ?? detail.action}
          subtitle={`${detail.entity_type}${detail.entity_id ? ' · ' + detail.entity_id : ''}`}
          onClose={() => setDetail(null)}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-beige-50 rounded-lg p-2">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Actor</div>
                <div className="text-stone-700 mt-1">{detail.user_full_name ?? '—'}</div>
                <div className="text-stone-400 font-mono">{detail.user_user_code ?? '—'}</div>
              </div>
              <div className="bg-beige-50 rounded-lg p-2">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">When</div>
                <div className="text-stone-700 mt-1">{new Date(detail.created_at).toLocaleString()}</div>
              </div>
            </div>

            {detail.old_value !== null && detail.old_value !== undefined && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Before</div>
                <pre className="text-xs bg-red-50 border border-red-100 rounded-lg p-3 overflow-x-auto text-stone-700">
{JSON.stringify(detail.old_value, null, 2)}
                </pre>
              </div>
            )}
            {detail.new_value !== null && detail.new_value !== undefined && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">After</div>
                <pre className="text-xs bg-olive-50 border border-olive-100 rounded-lg p-3 overflow-x-auto text-stone-700">
{JSON.stringify(detail.new_value, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
