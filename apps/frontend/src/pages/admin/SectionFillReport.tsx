import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getSectionFill, getTerms,
  type SectionFillPayload, type SectionFillRow, type SectionFillHistogramBin,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import DataTable from '../../components/DataTable';
import { SelectField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { csvEscape, downloadCsv, todayStamp } from '../../lib/csv';

const isActive = (v: unknown) => v === true || v === 'true';

type SortKey  = 'fill' | 'enrolled' | 'capacity' | 'section' | 'block';
type StatusFilter = 'all' | 'under' | 'normal' | 'full' | 'over' | 'empty';

const STATUS_LABEL: Record<SectionFillRow['status'], string> = {
  empty:  'Empty',
  under:  'Under-enrolled',
  normal: 'Normal',
  full:   'Full',
  over:   'Over capacity',
};
const STATUS_BADGE: Record<SectionFillRow['status'], string> = {
  empty:  'badge-neutral',
  under:  'badge-amber',
  normal: 'badge-completed',
  full:   'badge-faculty',
  over:   'badge-dropped',
};

// Same brand colours used by the retention chart.
const COLORS = {
  bar:    '#6B8030',    // olive-500
  barLow: '#D7A65B',    // amber-ish
  grid:   '#E7DEC5',    // khaki-100
  over:   '#dc2626',    // red-500
};

export default function SectionFillReport() {
  const toast = useToast();
  const [termId, setTermId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'fill', dir: 'desc' });

  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: () => getTerms() });
  const activeTerm = (terms as any[]).find((t: any) => isActive(t.is_active));
  const effectiveTermId = termId || activeTerm?.id || '';

  const { data, isLoading } = useQuery<SectionFillPayload>({
    queryKey: ['section-fill', effectiveTermId || 'active'],
    queryFn:  () => getSectionFill(effectiveTermId || undefined),
  });

  const rows = data?.sections ?? [];

  // ── Filter + sort ──────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:    rows.length,
    over:   rows.filter(r => r.status === 'over').length,
    full:   rows.filter(r => r.status === 'full').length,
    normal: rows.filter(r => r.status === 'normal').length,
    under:  rows.filter(r => r.status === 'under').length,
    empty:  rows.filter(r => r.status === 'empty').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const arr = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (sort.key === 'section') return a.sectionCode.localeCompare(b.sectionCode) * dir;
      if (sort.key === 'block')   return a.blockLabel.localeCompare(b.blockLabel) * dir;
      const av = sort.key === 'fill' ? a.fillPct : sort.key === 'enrolled' ? a.enrolled : a.capacity;
      const bv = sort.key === 'fill' ? b.fillPct : sort.key === 'enrolled' ? b.enrolled : b.capacity;
      return (av - bv) * dir;
    });
  }, [rows, statusFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: (key === 'section' || key === 'block') ? 'asc' : 'desc' });

  const handleExport = () => {
    if (filtered.length === 0) { toast.push({ tone: 'info', title: 'Nothing to export' }); return; }
    const header = [
      'section_code', 'course_code', 'course_title', 'block_label',
      'faculty_name', 'capacity', 'enrolled', 'fill_pct', 'status',
    ];
    const rowsCsv = filtered.map(r => [
      csvEscape(r.sectionCode),
      csvEscape(r.courseCode),
      csvEscape(r.courseTitle),
      csvEscape(r.blockLabel),
      csvEscape(r.facultyName ?? 'TBA'),
      String(r.capacity),
      String(r.enrolled),
      r.fillPct.toFixed(1),
      r.status,
    ]);
    const slug = data?.term?.name ? data.term.name.replace(/\s+/g, '-').toLowerCase() : 'no-term';
    downloadCsv([header, ...rowsCsv], `section-fill-${slug}-${todayStamp()}.csv`);
    toast.push({ tone: 'success', title: `Exported ${filtered.length} section${filtered.length === 1 ? '' : 's'}` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Section fill rates"
        subtitle="Spot under-enrolled offerings to consolidate, and over-cap sections that need a second offering."
        stats={[
          { label: 'Sections',      value: data?.summary.sectionsTotal ?? 0, icon: 'school', tone: 'olive' },
          { label: 'Avg fill',      value: data ? `${data.summary.avgFillPct.toFixed(1)}%` : '—', icon: 'trending-up' },
          { label: 'Under-enrolled', value: data?.summary.underCount ?? 0, icon: 'alert-triangle',
            tone: (data?.summary.underCount ?? 0) > 0 ? 'amber' : 'olive' },
          { label: 'Over capacity', value: data?.summary.overCount ?? 0, icon: 'alert-triangle',
            tone: (data?.summary.overCount ?? 0) > 0 ? 'red' : 'olive' },
        ]}
        action={
          <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={handleExport}>
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        }
      />

      {/* Term selector + summary line */}
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
              <span className="font-medium text-stone-700">{data.term.name}</span> · {data.summary.totalEnrolled} enrolled / {data.summary.totalCapacity} seats · under-enrolled cutoff {data.summary.underThreshold}%
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-56 rounded-xl mb-4" />
          <Skeleton className="h-64 rounded-xl" />
        </>
      ) : rows.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="school"
            title="No sections to show"
            message={data?.term
              ? `No sections exist for ${data.term.name} yet — open the term first.`
              : 'There is no active term in the system. Open one to start tracking fill rates.'}
          />
        </div>
      ) : (
        <>
          {/* Histogram */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-[0.08em]">Fill-rate distribution</h2>
              <span className="text-xs text-stone-500">{data?.summary.sectionsTotal} section{data?.summary.sectionsTotal === 1 ? '' : 's'} bucketed by % filled</span>
            </div>
            <FillHistogram bins={data?.histogram ?? []} underThreshold={data?.summary.underThreshold ?? 50} />
          </div>

          {/* Filter chips */}
          <div className="-mx-3 px-3 md:mx-0 md:px-0 mb-3 overflow-x-auto scrollable">
            <div className="flex items-center gap-1.5 w-max md:w-auto md:flex-wrap">
              <Chip active={statusFilter === 'all'}    onClick={() => setStatusFilter('all')}>All ({counts.all})</Chip>
              <Chip active={statusFilter === 'over'}   onClick={() => setStatusFilter('over')}>
                <Icon name="alert-triangle" size={10} className="text-red-500" /> Over ({counts.over})
              </Chip>
              <Chip active={statusFilter === 'full'}   onClick={() => setStatusFilter('full')}>Full ({counts.full})</Chip>
              <Chip active={statusFilter === 'normal'} onClick={() => setStatusFilter('normal')}>Normal ({counts.normal})</Chip>
              <Chip active={statusFilter === 'under'}  onClick={() => setStatusFilter('under')}>
                <Icon name="alert-triangle" size={10} className="text-amber-500" /> Under ({counts.under})
              </Chip>
              <Chip active={statusFilter === 'empty'}  onClick={() => setStatusFilter('empty')}>Empty ({counts.empty})</Chip>
            </div>
          </div>

          {/* Sortable table */}
          {filtered.length === 0 ? (
            <div className="card p-0">
              <EmptyState icon="filter" title="No sections match" message="Try a different status filter." />
            </div>
          ) : (
            <DataTable
              pageSize={15}
              headers={[
                { label: <SortHeader  k="section"  s={sort} onSort={toggleSort}>Section</SortHeader> },
                { label: 'Course' },
                { label: <SortHeader  k="block"    s={sort} onSort={toggleSort}>Block</SortHeader>,         hideBelow: 'md' },
                { label: 'Faculty',                                                                          hideBelow: 'lg' },
                { label: <SortHeader  k="enrolled" s={sort} onSort={toggleSort}>Enrolled</SortHeader>,      align: 'center' },
                { label: <SortHeader  k="capacity" s={sort} onSort={toggleSort}>Cap</SortHeader>,           align: 'center', hideBelow: 'sm' },
                { label: <SortHeader  k="fill"     s={sort} onSort={toggleSort}>Fill</SortHeader>,          align: 'center' },
                { label: 'Status',                                                                           align: 'right' },
              ]}
            >
              {filtered.map(r => (
                <tr key={r.sectionId} className="hover:bg-beige-50 transition-colors">
                  <td className="table-td font-mono text-xs font-semibold text-olive-600">{r.sectionCode}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-stone-500">{r.courseCode}</span>
                      <span className="text-stone-700 truncate">{r.courseTitle}</span>
                    </div>
                    <div className="text-[10px] text-stone-400 tabular">{r.units}u</div>
                  </td>
                  <td className="table-td font-mono text-xs text-stone-500 hidden md:table-cell">{r.blockLabel}</td>
                  <td className="table-td text-stone-600 text-xs hidden lg:table-cell">
                    {r.facultyName ?? <span className="text-stone-300 italic">TBA</span>}
                  </td>
                  <td className="table-td text-center tabular font-semibold">{r.enrolled}</td>
                  <td className="table-td text-center tabular hidden sm:table-cell text-stone-500">{r.capacity}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-20 h-1.5 bg-beige-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            r.status === 'over'  ? 'bg-red-400'
                            : r.status === 'full'  ? 'bg-faculty-400'
                            : r.status === 'normal' ? 'bg-olive-400'
                            : r.status === 'under' ? 'bg-amber-400'
                            : 'bg-stone-300'
                          }`}
                          style={{ width: `${Math.min(100, r.fillPct)}%` }}
                        />
                      </div>
                      <span className={`text-xs tabular font-semibold ${
                        r.status === 'over' ? 'text-red-500' :
                        r.status === 'under' ? 'text-amber-600' :
                        'text-stone-700'
                      }`}>{r.fillPct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="table-td text-right">
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </div>
  );
}

// ─── Histogram ───────────────────────────────────────────────────────────────

function FillHistogram({ bins, underThreshold }: {
  bins: SectionFillHistogramBin[]; underThreshold: number;
}) {
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Layout
  const W = 720, H = 220;
  const padLeft = 36, padRight = 16, padTop = 16, padBottom = 36;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const maxCount = Math.max(1, ...bins.map(b => b.count));
  const yMax = niceCeiling(maxCount);
  const yScale = (v: number) => (v / yMax) * innerH;

  const slotW = innerW / bins.length;
  const barWidth = Math.max(28, Math.min(80, slotW * 0.7));
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((yMax * i) / 4));

  // Colour each bar: red for over-cap overflow, amber when the bin's RIGHT
  // edge sits under the under-enrolled threshold, olive otherwise.
  const colorFor = (b: SectionFillHistogramBin) =>
    b.min >= 101         ? COLORS.over
    : b.max <= underThreshold ? COLORS.barLow
    :                       COLORS.bar;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {ticks.map(t => {
          const y = padTop + innerH - yScale(t);
          return (
            <g key={t}>
              <line x1={padLeft} x2={W - padRight} y1={y} y2={y} stroke={COLORS.grid} strokeDasharray="2 3" />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" className="fill-stone-400" style={{ fontSize: 9 }}>
                {t}
              </text>
            </g>
          );
        })}

        {bins.map((b, i) => {
          const xCenter = padLeft + slotW * i + slotW / 2;
          const x = xCenter - barWidth / 2;
          const h = yScale(b.count);
          const y = padTop + innerH - h;
          const onEnter = (e: React.MouseEvent) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            setHover({ idx: i, x: rect.left + rect.width / 2, y: rect.top });
          };
          return (
            <g key={b.label} onMouseEnter={onEnter} onMouseLeave={() => setHover(null)}
               style={{ cursor: 'pointer' }}>
              <rect x={padLeft + slotW * i} y={padTop} width={slotW} height={innerH} fill="transparent" />
              {b.count > 0 && <rect x={x} y={y} width={barWidth} height={h} fill={colorFor(b)} rx={3} />}
              <text x={xCenter} y={y - 4} textAnchor="middle" className="fill-stone-700"
                    style={{ fontSize: 10, fontWeight: 600 }}>
                {b.count}
              </text>
              <text x={xCenter} y={H - padBottom + 16} textAnchor="middle" className="fill-stone-500"
                    style={{ fontSize: 10 }}>
                {b.label}
              </text>
            </g>
          );
        })}

        <line x1={padLeft} x2={W - padRight} y1={padTop + innerH} y2={padTop + innerH} stroke={COLORS.grid} />
      </svg>

      {hover && bins[hover.idx] && (
        <div
          className="fixed z-50 bg-stone-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: hover.x, top: hover.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div className="font-semibold mb-0.5">{bins[hover.idx].label}</div>
          <div>{bins[hover.idx].count} section{bins[hover.idx].count === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable header cell ────────────────────────────────────────────────────

function SortHeader({ k, s, onSort, children }: {
  k: SortKey; s: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void; children: React.ReactNode;
}) {
  const active = s.key === k;
  return (
    <span
      className="cursor-pointer select-none hover:text-olive-600 transition-colors inline-flex items-center gap-1"
      onClick={() => onSort(k)}
    >
      {children}
      {active && <Icon name={s.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={10} className="text-olive-500" />}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function niceCeiling(n: number): number {
  if (n <= 5)   return 5;
  if (n <= 10)  return 10;
  if (n <= 25)  return 25;
  if (n <= 50)  return 50;
  if (n <= 100) return 100;
  return Math.ceil(n / 100) * 100;
}
