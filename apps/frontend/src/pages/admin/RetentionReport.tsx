import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getRetention, getPrograms,
  type RetentionPayload, type CohortRetentionRow,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { SelectField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { downloadCsv, todayStamp } from '../../lib/csv';

// Brand palette pulled from the existing Tailwind theme.
const COLORS = {
  active:    '#6B8030',    // olive-500
  graduated: '#B09A65',    // khaki-500
  inactive:  '#A8A29E',    // stone-400
  grid:      '#E7DEC5',    // khaki-100
};

export default function RetentionReport() {
  const toast = useToast();
  const [programId, setProgramId] = useState<string>('');

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn:  () => getPrograms(),
  });
  const { data, isLoading } = useQuery<RetentionPayload>({
    queryKey: ['retention', programId || 'all'],
    queryFn:  () => getRetention(programId || undefined),
  });

  const cohorts: CohortRetentionRow[] = data?.cohorts ?? [];
  // Chart data uses oldest-first so the X axis reads left → right by entry year.
  const chartData = useMemo(() => [...cohorts].sort((a, b) => a.cohortYear.localeCompare(b.cohortYear)), [cohorts]);

  const handleExport = () => {
    if (cohorts.length === 0) {
      toast.push({ tone: 'info', title: 'Nothing to export' });
      return;
    }
    const header = ['cohort_year', 'total', 'active', 'graduated', 'inactive', 'retention_pct'];
    const rows = cohorts.map(c => [
      c.cohortYear, String(c.total), String(c.active),
      String(c.graduated), String(c.inactive), c.retention.toFixed(1),
    ]);
    downloadCsv([header, ...rows], `retention-${data?.program?.code ?? 'all'}-${todayStamp()}.csv`);
    toast.push({ tone: 'success', title: `Exported ${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'}` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Cohort retention"
        subtitle="Of students who entered in a given year, how many are still active, graduated, or no longer enrolled."
        stats={[
          { label: 'Students tracked',  value: data?.summary.totalStudents     ?? 0, icon: 'users',    tone: 'olive' },
          { label: 'Active',            value: data?.summary.activeStudents    ?? 0, icon: 'check',    tone: 'olive' },
          { label: 'Graduated',         value: data?.summary.graduatedStudents ?? 0, icon: 'award',    tone: 'khaki' },
          { label: 'Retention',         value: data ? `${data.summary.overallRetention.toFixed(1)}%` : '—', icon: 'trending-up', tone: 'olive' },
        ]}
        action={
          <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={handleExport}>
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        }
      />

      {/* Filter row */}
      <div className="card mb-4 !py-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="w-full sm:w-72">
            <SelectField label="Program" value={programId} onChange={e => setProgramId(e.target.value)}>
              <option value="">All programs</option>
              {programs.map((p: any) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </SelectField>
          </div>
          {data?.program && (
            <div className="text-xs text-stone-500 sm:ml-auto">
              Showing cohorts for <span className="font-mono font-semibold text-olive-600">{data.program.code}</span> · {data.summary.cohortsCovered} cohort{data.summary.cohortsCovered === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-72 rounded-xl mb-4" />
          <Skeleton className="h-48 rounded-xl" />
        </>
      ) : cohorts.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="trending-up"
            title="No cohorts to show"
            message={programId
              ? 'This program has no students with a recognisable cohort code yet.'
              : 'No students in the system have a recognisable cohort code yet.'}
          />
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-[0.08em]">Cohort breakdown</h2>
              <Legend />
            </div>
            <RetentionChart data={chartData} />
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">Cohort</th>
                    <th className="table-th text-center">Total</th>
                    <th className="table-th text-center hidden sm:table-cell">Active</th>
                    <th className="table-th text-center hidden sm:table-cell">Graduated</th>
                    <th className="table-th text-center hidden sm:table-cell">Inactive</th>
                    <th className="table-th text-right">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.cohortYear} className="hover:bg-beige-50 transition-colors">
                      <td className="table-td font-mono font-semibold text-olive-600">{c.cohortYear}</td>
                      <td className="table-td text-center tabular">{c.total}</td>
                      <td className="table-td text-center tabular text-olive-700 hidden sm:table-cell">{c.active}</td>
                      <td className="table-td text-center tabular text-khaki-600 hidden sm:table-cell">{c.graduated}</td>
                      <td className="table-td text-center tabular text-stone-500 hidden sm:table-cell">{c.inactive}</td>
                      <td className="table-td text-right tabular font-semibold">
                        <span className={c.retention >= 80 ? 'text-olive-600' : c.retention >= 60 ? 'text-khaki-600' : 'text-red-500'}>
                          {c.retention.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center gap-1.5">
              <Icon name="info" size={12} />
              Cohort year is the entry year embedded in each student's user code.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-stone-600">
      <LegendItem color={COLORS.active}    label="Active" />
      <LegendItem color={COLORS.graduated} label="Graduated" />
      <LegendItem color={COLORS.inactive}  label="Inactive" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ─── Chart ───────────────────────────────────────────────────────────────────

interface ChartProps { data: CohortRetentionRow[] }

/**
 * Stacked vertical bar chart, hand-rolled in SVG. One bar per cohort:
 *   bottom → top stack is inactive · graduated · active.
 * Height is proportional to the max-cohort total so the scale is consistent
 * across cohorts. Hover surfaces a tooltip with the raw counts.
 */
function RetentionChart({ data }: ChartProps) {
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Layout constants
  const W = 720;                                  // intrinsic width — scales with container via viewBox
  const H = 280;
  const padLeft = 36, padRight = 16, padTop = 16, padBottom = 36;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const maxTotal = Math.max(1, ...data.map(d => d.total));
  // Round the Y-axis ceiling up to a nice number for readable gridlines.
  const yMax     = niceCeiling(maxTotal);
  const yScale   = (v: number) => (v / yMax) * innerH;

  const barCount = data.length;
  const barWidth = Math.max(24, Math.min(60, innerW / barCount * 0.7));
  const slotW    = innerW / barCount;

  // Y-axis tick values (4 evenly spaced + zero)
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((yMax * i) / 4));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis gridlines + labels */}
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

        {/* Bars */}
        {data.map((d, i) => {
          const xCenter = padLeft + slotW * i + slotW / 2;
          const x = xCenter - barWidth / 2;

          const hInactive  = yScale(d.inactive);
          const hGraduated = yScale(d.graduated);
          const hActive    = yScale(d.active);

          // Stack bottom-up.
          const yInactive  = padTop + innerH - hInactive;
          const yGraduated = yInactive  - hGraduated;
          const yActive    = yGraduated - hActive;

          const onEnter = (e: React.MouseEvent) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            setHover({ idx: i, x: rect.left + rect.width / 2, y: rect.top });
          };
          const onLeave = () => setHover(null);

          return (
            <g key={d.cohortYear}
               onMouseEnter={onEnter}
               onMouseLeave={onLeave}
               style={{ cursor: 'pointer' }}>
              {/* Hover hit area covers the whole column */}
              <rect x={padLeft + slotW * i} y={padTop} width={slotW} height={innerH} fill="transparent" />

              {d.inactive  > 0 && <rect x={x} y={yInactive}  width={barWidth} height={hInactive}  fill={COLORS.inactive}  rx={2} />}
              {d.graduated > 0 && <rect x={x} y={yGraduated} width={barWidth} height={hGraduated} fill={COLORS.graduated} rx={2} />}
              {d.active    > 0 && <rect x={x} y={yActive}    width={barWidth} height={hActive}    fill={COLORS.active}    rx={2} />}

              {/* Total label on top of the bar */}
              <text x={xCenter} y={yActive - 4} textAnchor="middle" className="fill-stone-600" style={{ fontSize: 10, fontWeight: 600 }}>
                {d.total}
              </text>

              {/* X-axis label */}
              <text x={xCenter} y={H - padBottom + 16} textAnchor="middle" className="fill-stone-500" style={{ fontSize: 10 }}>
                {d.cohortYear}
              </text>
              <text x={xCenter} y={H - padBottom + 28} textAnchor="middle" className="fill-stone-400" style={{ fontSize: 9 }}>
                {d.retention.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Axis line */}
        <line x1={padLeft} x2={W - padRight} y1={padTop + innerH} y2={padTop + innerH} stroke={COLORS.grid} />
      </svg>

      {/* Tooltip — anchored to viewport so it doesn't get clipped by overflow */}
      {hover && data[hover.idx] && (
        <div
          className="fixed z-50 bg-stone-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{
            left: hover.x,
            top:  hover.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-mono font-semibold text-sm mb-1">{data[hover.idx].cohortYear}</div>
          <div className="space-y-0.5 tabular">
            <TooltipRow color={COLORS.active}    label="Active"    value={data[hover.idx].active} />
            <TooltipRow color={COLORS.graduated} label="Graduated" value={data[hover.idx].graduated} />
            <TooltipRow color={COLORS.inactive}  label="Inactive"  value={data[hover.idx].inactive} />
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-stone-700 flex items-center justify-between gap-3">
            <span className="text-stone-300">Retention</span>
            <span className="font-semibold">{data[hover.idx].retention.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Round up to a "nice" ceiling so gridline values are readable (10, 20, 25, 50, 100…). */
function niceCeiling(n: number): number {
  if (n <= 5)   return 5;
  if (n <= 10)  return 10;
  if (n <= 25)  return 25;
  if (n <= 50)  return 50;
  if (n <= 100) return 100;
  // For larger values, round up to the nearest 100.
  return Math.ceil(n / 100) * 100;
}
