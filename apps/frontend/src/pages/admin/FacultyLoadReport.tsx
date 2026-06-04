import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getFacultyLoad, getTerms,
  type FacultyLoadPayload, type FacultyLoadRow,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Chip from '../../components/Chip';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { SelectField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { csvEscape, downloadCsv, todayStamp } from '../../lib/csv';

const isActive = (v: unknown) => v === true || v === 'true';

type SortKey = 'units' | 'hours' | 'sections' | 'utilization' | 'name';
type StatusFilter = 'all' | 'overload' | 'normal' | 'underload' | 'idle';

const STATUS_LABEL: Record<FacultyLoadRow['status'], string> = {
  overload:  'Overloaded',
  normal:    'Normal',
  underload: 'Light',
  idle:      'Idle',
};
const STATUS_BADGE: Record<FacultyLoadRow['status'], string> = {
  overload:  'badge-dropped',
  normal:    'badge-completed',
  underload: 'badge-amber',
  idle:      'badge-neutral',
};

export default function FacultyLoadReport() {
  const toast = useToast();
  const [termId, setTermId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'units', dir: 'desc' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: () => getTerms() });
  const activeTerm = (terms as any[]).find((t: any) => isActive(t.is_active));
  // Default the dropdown to the active term once it lands.
  const effectiveTermId = termId || activeTerm?.id || '';

  const { data, isLoading } = useQuery<FacultyLoadPayload>({
    queryKey: ['faculty-load', effectiveTermId || 'active'],
    queryFn:  () => getFacultyLoad(effectiveTermId || undefined),
  });

  // ── Filter + sort ─────────────────────────────────────────────────────
  const rows = data?.faculty ?? [];
  const counts = useMemo(() => ({
    all:       rows.length,
    overload:  rows.filter(r => r.status === 'overload').length,
    normal:    rows.filter(r => r.status === 'normal').length,
    underload: rows.filter(r => r.status === 'underload').length,
    idle:      rows.filter(r => r.status === 'idle').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const arr = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter);
    const dir = sort.dir === 'asc' ? 1 : -1;
    const get = (r: FacultyLoadRow) =>
      sort.key === 'units'        ? r.totalUnits
      : sort.key === 'hours'      ? r.hoursPerWeek
      : sort.key === 'sections'   ? r.sectionCount
      : sort.key === 'utilization'? r.utilization
      : 0;
    if (sort.key === 'name') {
      return [...arr].sort((a, b) => a.fullName.localeCompare(b.fullName) * dir);
    }
    return [...arr].sort((a, b) => (get(a) - get(b)) * dir);
  }, [rows, statusFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' });

  const handleExport = () => {
    if (filtered.length === 0) { toast.push({ tone: 'info', title: 'Nothing to export' }); return; }
    const header = [
      'full_name', 'user_code', 'email', 'sections', 'total_units', 'hours_per_week',
      'max_teaching_units', 'utilization_pct', 'status',
    ];
    const rowsCsv = filtered.map(r => [
      csvEscape(r.fullName),
      csvEscape(r.userCode ?? ''),
      csvEscape(r.email),
      String(r.sectionCount),
      String(r.totalUnits),
      r.hoursPerWeek.toFixed(1),
      r.maxTeachingUnits == null ? '' : String(r.maxTeachingUnits),
      r.utilization.toFixed(1),
      r.status,
    ]);
    const slug = data?.term?.name ? data.term.name.replace(/\s+/g, '-').toLowerCase() : 'no-term';
    downloadCsv([header, ...rowsCsv], `faculty-load-${slug}-${todayStamp()}.csv`);
    toast.push({ tone: 'success', title: `Exported ${filtered.length} row${filtered.length === 1 ? '' : 's'}` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Faculty teaching load"
        subtitle="Per-faculty totals for a term so you can spot overload and idle capacity at a glance."
        stats={[
          { label: 'Faculty',     value: data?.summary.facultyTotal     ?? 0, icon: 'user-check', tone: 'olive' },
          { label: 'Avg units',   value: data?.summary.avgUnits         ?? 0, icon: 'trending-up' },
          { label: 'Overloaded',  value: data?.summary.overloadedCount  ?? 0, icon: 'alert-triangle', tone: (data?.summary.overloadedCount ?? 0) > 0 ? 'red' : 'olive' },
          { label: 'Idle',        value: data?.summary.idleCount        ?? 0, icon: 'inbox',       tone: (data?.summary.idleCount ?? 0) > 0 ? 'amber' : 'olive' },
        ]}
        action={
          <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={handleExport}>
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        }
      />

      {/* Term selector */}
      <div className="card mb-4 !py-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="w-full sm:w-72">
            <SelectField label="Term" value={effectiveTermId} onChange={e => setTermId(e.target.value)}>
              {(terms as any[]).length === 0 && <option value="">No terms yet</option>}
              {(terms as any[]).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}{isActive(t.is_active) ? ' · active' : ''}
                </option>
              ))}
            </SelectField>
          </div>
          {data?.term && (
            <div className="text-xs text-stone-500 sm:ml-auto">
              Showing <span className="font-medium text-stone-700">{data.term.name}</span> · cap default {data.summary.overloadThreshold} units · total {data.summary.totalHours.toFixed(1)} hrs/week
            </div>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="-mx-3 px-3 md:mx-0 md:px-0 mb-3 overflow-x-auto scrollable">
        <div className="flex items-center gap-1.5 w-max md:w-auto md:flex-wrap">
          <Chip active={statusFilter === 'all'}       onClick={() => setStatusFilter('all')}>All ({counts.all})</Chip>
          <Chip active={statusFilter === 'overload'}  onClick={() => setStatusFilter('overload')}>
            <Icon name="alert-triangle" size={10} className="text-red-500" /> Overloaded ({counts.overload})
          </Chip>
          <Chip active={statusFilter === 'normal'}    onClick={() => setStatusFilter('normal')}>Normal ({counts.normal})</Chip>
          <Chip active={statusFilter === 'underload'} onClick={() => setStatusFilter('underload')}>Light ({counts.underload})</Chip>
          <Chip active={statusFilter === 'idle'}      onClick={() => setStatusFilter('idle')}>Idle ({counts.idle})</Chip>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="user-check"
            title="No faculty match"
            message={rows.length === 0
              ? data?.term
                ? `No active faculty for ${data.term.name} yet.`
                : 'No active faculty in the system.'
              : 'Try a different status filter.'}
          />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th sortKey="name"        sort={sort} onSort={toggleSort}>Faculty</Th>
                  <Th sortKey="sections"    sort={sort} onSort={toggleSort} align="center" className="hidden sm:table-cell">Sections</Th>
                  <Th sortKey="units"       sort={sort} onSort={toggleSort} align="center">Units</Th>
                  <Th sortKey="hours"       sort={sort} onSort={toggleSort} align="center" className="hidden md:table-cell">Hrs/wk</Th>
                  <Th sortKey="utilization" sort={sort} onSort={toggleSort} align="center">Utilization</Th>
                  <th className="table-th">Status</th>
                  <th className="table-th" style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <FacultyRow
                    key={r.facultyId}
                    row={r}
                    expanded={expanded === r.facultyId}
                    onToggle={() => setExpanded(prev => prev === r.facultyId ? null : r.facultyId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center gap-1.5">
            <Icon name="info" size={12} />
            Utilization is units ÷ each faculty's load cap (or {data?.summary.overloadThreshold ?? 24} when no cap is set). Click any row to see their section list.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table row ───────────────────────────────────────────────────────────────

function FacultyRow({ row, expanded, onToggle }: {
  row: FacultyLoadRow; expanded: boolean; onToggle: () => void;
}) {
  const cap = row.maxTeachingUnits;
  return (
    <>
      <tr className="hover:bg-beige-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="table-td">
          <div className="flex items-center gap-2.5">
            <Avatar name={row.fullName} size={28} tone="beige" />
            <div className="min-w-0">
              <div className="font-medium text-stone-800 truncate">{row.fullName}</div>
              <div className="text-[10px] text-stone-400 font-mono truncate">{row.userCode ?? row.email}</div>
            </div>
          </div>
        </td>
        <td className="table-td text-center tabular hidden sm:table-cell">{row.sectionCount}</td>
        <td className="table-td text-center tabular font-semibold">
          {row.totalUnits}
          {cap != null && <span className="text-stone-400 text-[10px] font-normal"> / {cap}</span>}
        </td>
        <td className="table-td text-center tabular hidden md:table-cell">{row.hoursPerWeek.toFixed(1)}</td>
        <td className="table-td">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-20 h-1.5 bg-beige-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${row.utilization > 100 ? 'bg-red-400' : row.utilization >= 80 ? 'bg-olive-400' : row.utilization >= 50 ? 'bg-khaki-400' : 'bg-stone-300'}`}
                style={{ width: `${Math.min(100, row.utilization)}%` }}
              />
            </div>
            <span className={`text-xs tabular font-semibold ${row.utilization > 100 ? 'text-red-500' : 'text-stone-700'}`}>{row.utilization.toFixed(0)}%</span>
          </div>
        </td>
        <td className="table-td">
          <span className={`badge ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
        </td>
        <td className="table-td text-right">
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} className="text-stone-400" />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-beige-50/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">
              {row.sectionCount === 0 ? 'No sections in this term' : `Sections (${row.sectionCount})`}
            </div>
            {row.sectionCount === 0 ? (
              <p className="text-xs text-stone-400 italic">Not assigned to anything yet.</p>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto scrollable">
                {row.sections.map(s => (
                  <li key={s.sectionId} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded bg-white border border-beige-200">
                    <span className="font-mono font-semibold text-olive-600 w-20 truncate">{s.courseCode}</span>
                    <span className="flex-1 text-stone-700 truncate">{s.courseTitle}</span>
                    <span className="text-stone-500 tabular hidden sm:inline">
                      {s.dayOfWeek
                        ? <><span className="font-mono">{s.dayOfWeek}</span> {(s.startTime ?? '').slice(0,5)}–{(s.endTime ?? '').slice(0,5)}</>
                        : <span className="text-stone-300 italic">TBA</span>}
                    </span>
                    <span className="text-stone-400 tabular text-[10px] w-12 text-right">{s.units}u</span>
                    <span className="text-stone-400 tabular text-[10px] w-12 text-right">{s.hoursPerWeek}h</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Sortable header cell ────────────────────────────────────────────────────

function Th({ sortKey, sort, onSort, children, align, className }: {
  sortKey: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void; children: React.ReactNode;
  align?: 'left' | 'right' | 'center'; className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`table-th cursor-pointer select-none hover:text-olive-600 transition-colors ${
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''
      } ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <Icon name={sort.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={10} className="text-olive-500" />}
      </span>
    </th>
  );
}
