import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getGwaStats, getPrograms,
  type GwaStatsPayload, type GwaGroupRow, type GwaGroupBy,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import DataTable from '../../components/DataTable';
import { SelectField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { csvEscape, downloadCsv, todayStamp } from '../../lib/csv';

// PH grade scale anchors. We invert the Y axis so "up" reads as "better"
// despite 1.00 being the best score.
const SCALE_MIN = 1.0;
const SCALE_MAX = 5.0;
const DEAN_LINE      = 1.5;
const PASSING_LINE   = 3.0;

const COLORS = {
  line:   '#6B8030',     // olive-500
  point:  '#5B6927',     // olive-700
  grid:   '#E7DEC5',     // khaki-100
  dean:   '#B09A65',     // khaki-500
  pass:   '#D7A65B',     // amber-ish
  // Standing band tints — used by the distribution segments
  presidents: '#5B6927', // darkest olive
  deans:      '#6B8030',
  good:       '#B09A65',
  warning:    '#D7A65B',
  failing:    '#dc2626', // red
};

export default function GwaReport() {
  const toast = useToast();
  const [programId, setProgramId] = useState<string>('');
  const [groupBy,   setGroupBy]   = useState<GwaGroupBy>('cohort');

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn:  () => getPrograms(),
  });
  const { data, isLoading } = useQuery<GwaStatsPayload>({
    queryKey: ['gwa-stats', programId || 'all', groupBy],
    queryFn:  () => getGwaStats({ programId: programId || undefined, groupBy }),
  });

  const groups = data?.groups ?? [];
  // Chart consumes the sort-key order — already ASC out of the backend.
  const chartGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    [groups],
  );

  const handleExport = () => {
    if (groups.length === 0) {
      toast.push({ tone: 'info', title: 'Nothing to export' });
      return;
    }
    const header = [
      'group_label', 'students', 'avg_gwa', 'best_gwa', 'worst_gwa',
      'presidents', 'deans', 'good', 'warning', 'failing',
    ];
    const rows = groups.map(g => [
      csvEscape(g.groupLabel),
      String(g.studentsCount),
      g.avgGwa   != null ? g.avgGwa.toFixed(3)   : '',
      g.bestGwa  != null ? g.bestGwa.toFixed(2)  : '',
      g.worstGwa != null ? g.worstGwa.toFixed(2) : '',
      String(g.presidents), String(g.deans), String(g.good),
      String(g.warning), String(g.failing),
    ]);
    const slug = `${data?.program?.code ?? 'all'}-${groupBy}`;
    downloadCsv([header, ...rows], `gwa-stats-${slug}-${todayStamp()}.csv`);
    toast.push({ tone: 'success', title: `Exported ${groups.length} group${groups.length === 1 ? '' : 's'}` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Average GWA"
        subtitle="Trend signal for program strength. PH grade scale — lower is better, 1.00 is excellence."
        stats={[
          { label: 'Students tracked',   value: data?.summary.studentsTracked ?? 0, icon: 'users',     tone: 'olive' },
          { label: 'Overall avg GWA',    value: data?.summary.overallAvg != null ? data.summary.overallAvg.toFixed(2) : '—', icon: 'trending-up' },
          { label: groupBy === 'cohort' ? 'Best cohort' : 'Best term',
            value: data?.summary.bestGroup
              ? `${data.summary.bestGroup.label} · ${data.summary.bestGroup.avgGwa.toFixed(2)}`
              : '—',
            icon: 'award', tone: 'olive' },
          { label: groupBy === 'cohort' ? 'Weakest cohort' : 'Weakest term',
            value: data?.summary.worstGroup
              ? `${data.summary.worstGroup.label} · ${data.summary.worstGroup.avgGwa.toFixed(2)}`
              : '—',
            icon: 'alert-triangle',
            tone: (data?.summary.worstGroup?.avgGwa ?? 0) > PASSING_LINE ? 'red' : 'olive' },
        ]}
        action={
          <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={handleExport}>
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        }
      />

      {/* Filters: program + group-by toggle */}
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
          <div>
            <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1.5">Group by</div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setGroupBy('cohort')}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  groupBy === 'cohort'
                    ? 'bg-olive-100 text-olive-700 border border-olive-200'
                    : 'text-stone-600 hover:bg-beige-100 border border-beige-200'
                }`}
              >
                Cohort (entry year)
              </button>
              <button
                onClick={() => setGroupBy('term')}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  groupBy === 'term'
                    ? 'bg-olive-100 text-olive-700 border border-olive-200'
                    : 'text-stone-600 hover:bg-beige-100 border border-beige-200'
                }`}
              >
                Academic term
              </button>
            </div>
          </div>
          {data?.program && (
            <div className="text-xs text-stone-500 sm:ml-auto">
              <span className="font-mono font-semibold text-olive-600">{data.program.code}</span> · {data.summary.groupCount} {groupBy === 'cohort' ? 'cohort' : 'term'}{data.summary.groupCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-72 rounded-xl mb-4" />
          <Skeleton className="h-56 rounded-xl" />
        </>
      ) : groups.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="bar-chart"
            title="No GWA data yet"
            message="Once finalized letter grades are recorded, average GWA will appear here for each cohort or term."
          />
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-[0.08em]">
                {groupBy === 'cohort' ? 'GWA by cohort year' : 'GWA by term'}
              </h2>
              <ChartLegend />
            </div>
            <GwaLineChart data={chartGroups} />
          </div>

          <div className="card p-0 overflow-hidden">
            <DataTable
              pageSize={15}
              headers={[
                { label: groupBy === 'cohort' ? 'Cohort' : 'Term' },
                { label: 'Students',  align: 'center' },
                { label: 'Avg GWA',   align: 'center' },
                { label: 'Best',      align: 'center', hideBelow: 'sm' },
                { label: 'Worst',     align: 'center', hideBelow: 'sm' },
                { label: 'Distribution', hideBelow: 'md' },
              ]}
            >
              {groups.map(g => (
                <tr key={g.groupKey} className="hover:bg-beige-50 transition-colors">
                  <td className="table-td font-mono font-semibold text-olive-600">{g.groupLabel}</td>
                  <td className="table-td text-center tabular">{g.studentsCount}</td>
                  <td className="table-td text-center tabular font-semibold">
                    {g.avgGwa != null
                      ? <span className={gwaClass(g.avgGwa)}>{g.avgGwa.toFixed(2)}</span>
                      : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="table-td text-center tabular text-olive-700 hidden sm:table-cell">
                    {g.bestGwa != null ? g.bestGwa.toFixed(2) : '—'}
                  </td>
                  <td className="table-td text-center tabular text-red-500 hidden sm:table-cell">
                    {g.worstGwa != null ? g.worstGwa.toFixed(2) : '—'}
                  </td>
                  <td className="table-td hidden md:table-cell">
                    <DistributionBar row={g} />
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center gap-1.5">
              <Icon name="info" size={12} />
              "Avg GWA" averages individual student GWAs (each student weighted equally). Distribution bands match the PH Dean's-list / probation thresholds.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Distribution bar ────────────────────────────────────────────────────────

function DistributionBar({ row }: { row: GwaGroupRow }) {
  const total = row.studentsCount;
  if (total === 0) return <span className="text-stone-300 text-xs">—</span>;
  const segs = [
    { count: row.presidents, color: COLORS.presidents, label: "President's" },
    { count: row.deans,      color: COLORS.deans,      label: "Dean's" },
    { count: row.good,       color: COLORS.good,       label: 'Good' },
    { count: row.warning,    color: COLORS.warning,    label: 'Warning' },
    { count: row.failing,    color: COLORS.failing,    label: 'Failing' },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-beige-200 flex">
        {segs.map((s, i) => s.count > 0 && (
          <div
            key={i}
            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-stone-400 tabular w-12 text-right">
        {row.presidents + row.deans}/{total}
      </span>
    </div>
  );
}

// ─── Line chart ──────────────────────────────────────────────────────────────

function GwaLineChart({ data }: { data: GwaGroupRow[] }) {
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Layout
  const W = 720, H = 280;
  const padLeft = 44, padRight = 16, padTop = 16, padBottom = 36;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  // INVERTED Y: 1.00 sits at the TOP so "up" reads as "better."
  const yToPx = (gwa: number) => {
    const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, gwa));
    const pct = (clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
    return padTop + pct * innerH;
  };

  const n = data.length;
  const xStep = n <= 1 ? 0 : innerW / (n - 1);
  const xToPx = (i: number) => n === 1 ? padLeft + innerW / 2 : padLeft + i * xStep;

  // Y ticks at canonical PH grade values
  const yTicks = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0];

  // Build the line path, skipping points with null GWA.
  const path = data.reduce<{ d: string; started: boolean }>((acc, g, i) => {
    if (g.avgGwa == null) return acc;
    const cmd = acc.started ? 'L' : 'M';
    return { d: acc.d + `${cmd} ${xToPx(i)} ${yToPx(g.avgGwa)} `, started: true };
  }, { d: '', started: false }).d;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis gridlines + canonical-grade labels */}
        {yTicks.map(t => {
          const y = yToPx(t);
          const isDean = t === DEAN_LINE;
          const isPass = t === PASSING_LINE;
          return (
            <g key={t}>
              <line
                x1={padLeft} x2={W - padRight} y1={y} y2={y}
                stroke={isDean ? COLORS.dean : isPass ? COLORS.pass : COLORS.grid}
                strokeDasharray={isDean || isPass ? '4 4' : '2 3'}
                strokeWidth={isDean || isPass ? 1 : 1}
              />
              <text x={padLeft - 6} y={y + 3} textAnchor="end"
                className={isDean ? 'fill-khaki-600' : isPass ? 'fill-amber-600' : 'fill-stone-400'}
                style={{ fontSize: 9, fontWeight: isDean || isPass ? 600 : 400 }}>
                {t.toFixed(2)}
              </text>
              {isDean && (
                <text x={W - padRight} y={y - 4} textAnchor="end" className="fill-khaki-600" style={{ fontSize: 8 }}>
                  Dean's List
                </text>
              )}
              {isPass && (
                <text x={W - padRight} y={y - 4} textAnchor="end" className="fill-amber-600" style={{ fontSize: 8 }}>
                  Passing
                </text>
              )}
            </g>
          );
        })}

        {/* Trend line */}
        {path && <path d={path} stroke={COLORS.line} strokeWidth={2} fill="none" />}

        {/* Points + hover hit areas */}
        {data.map((g, i) => {
          if (g.avgGwa == null) return null;
          const cx = xToPx(i);
          const cy = yToPx(g.avgGwa);
          const onEnter = (e: React.MouseEvent) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            setHover({ idx: i, x: rect.left + rect.width / 2, y: rect.top });
          };
          return (
            <g key={g.groupKey} onMouseEnter={onEnter} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              <circle cx={cx} cy={cy} r={4} fill={COLORS.point} stroke="white" strokeWidth={1.5} />
              <text x={cx} y={cy - 10} textAnchor="middle" className="fill-stone-700"
                style={{ fontSize: 10, fontWeight: 600 }}>
                {g.avgGwa.toFixed(2)}
              </text>
              <text x={cx} y={H - padBottom + 16} textAnchor="middle" className="fill-stone-500"
                style={{ fontSize: 9 }}>
                {/* For terms, the label can be long — truncate. */}
                {g.groupLabel.length > 18 ? g.groupLabel.slice(0, 16) + '…' : g.groupLabel}
              </text>
            </g>
          );
        })}

        {/* X-axis baseline */}
        <line x1={padLeft} x2={W - padRight} y1={padTop + innerH} y2={padTop + innerH} stroke={COLORS.grid} />
      </svg>

      {hover && data[hover.idx] && data[hover.idx].avgGwa != null && (
        <div
          className="fixed z-50 bg-stone-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: hover.x, top: hover.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div className="font-semibold mb-1">{data[hover.idx].groupLabel}</div>
          <div className="space-y-0.5 tabular">
            <TooltipRow label="Avg GWA" value={data[hover.idx].avgGwa!.toFixed(2)} />
            <TooltipRow label="Students" value={data[hover.idx].studentsCount} />
            <TooltipRow label="Best"  value={data[hover.idx].bestGwa  != null ? data[hover.idx].bestGwa!.toFixed(2)  : '—'} />
            <TooltipRow label="Worst" value={data[hover.idx].worstGwa != null ? data[hover.idx].worstGwa!.toFixed(2) : '—'} />
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-stone-300">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-stone-600">
      <span className="flex items-center gap-1.5">
        <span className="w-4 h-0.5" style={{ backgroundColor: COLORS.line }} /> Avg GWA
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.dean }} /> Dean's List (1.50)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.pass }} /> Passing (3.00)
      </span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gwaClass(gwa: number): string {
  if (gwa <= 1.50) return 'text-olive-700';
  if (gwa <= 2.50) return 'text-olive-600';
  if (gwa <= 3.00) return 'text-amber-600';
  return 'text-red-500';
}
