import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getStudentGrades } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import SectionTitle from '../../components/SectionTitle';
import StatTile from '../../components/StatTile';
import EmptyState from '../../components/EmptyState';
import ProgressBar from '../../components/ProgressBar';
import DataTable from '../../components/DataTable';
import Icon from '../../components/Icon';

const isActive = (v: unknown) => v === true || v === 'true';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function describeGWA(gwa: number | null) {
  if (gwa == null) return { tone: 'neutral', label: 'No record' };
  if (gwa <= 1.25) return { tone: 'olive', label: "President's List" };
  if (gwa <= 1.50) return { tone: 'olive', label: "Dean's List" };
  if (gwa <= 2.50) return { tone: 'khaki', label: 'Good standing' };
  if (gwa <= 3.00) return { tone: 'amber', label: 'Warning' };
  return { tone: 'red', label: 'Probation' };
}

function todayCode() {
  const map = ['', 'M', 'T', 'W', 'Th', 'F'];
  return map[new Date().getDay()] || '';
}
function meetsToday(d: string | undefined | null, code: string) {
  if (!d || !code) return false;
  if (code === 'Th') return /Th/.test(d);
  return d.replace(/Th/g, '').includes(code);
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: grades = [] } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: () => getStudentGrades(user!.id),
    enabled: !!user,
  });

  const finalized = grades.filter((e: any) => e.letter_grade);
  const sumU = finalized.reduce((s: number, e: any) => s + Number(e.units || 3), 0);
  const gwa = sumU > 0
    ? finalized.reduce((s: number, e: any) => s + Number(e.letter_grade) * Number(e.units || 3), 0) / sumU
    : null;
  const standing = describeGWA(gwa);

  const activeEnrollments = grades.filter((e: any) => isActive(e.term_is_active) && e.status === 'enrolled');
  const totalUnits = activeEnrollments.reduce((s: number, e: any) => s + Number(e.units || 0), 0);
  const activeTerm: any = activeEnrollments[0];

  let weekInfo: { week: number; total: number; pct: number; startStr: string; endStr: string } | null = null;
  if (activeTerm) {
    const start = new Date(activeTerm.start_date).getTime();
    const end   = new Date(activeTerm.end_date).getTime();
    const total = Math.max(1, Math.round((end - start) / WEEK));
    const week  = Math.max(0, Math.min(total, Math.round((Date.now() - start) / WEEK)));
    weekInfo = {
      week, total, pct: week / total,
      startStr: new Date(activeTerm.start_date).toLocaleDateString(),
      endStr:   new Date(activeTerm.end_date).toLocaleDateString(),
    };
  }

  const tCode = todayCode();
  const todays = activeEnrollments
    .filter((e: any) => meetsToday(e.day_of_week, tCode))
    .sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));

  const firstName = user?.fullName.split(' ')[0] || '';

  const standingBadgeCls =
    standing.tone === 'red'   ? 'badge-dropped'
    : standing.tone === 'amber' ? 'badge-amber'
    : standing.tone === 'olive' ? 'badge-completed'
    : standing.tone === 'khaki' ? 'badge-faculty'
    : 'badge-neutral';
  const standingIcon =
    standing.tone === 'olive' ? 'award'
    : standing.tone === 'red' ? 'alert-triangle'
    : 'check';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Good day, ${firstName}`}
        title="Your semester at a glance"
        subtitle={`${user?.programName || 'Program TBA'} · Year ${user?.yearLevel ?? '—'} · ${activeTerm?.term_name || 'No active term'}`}
      />

      {/* GWA + stats + term progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-1 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-olive-50/70 pointer-events-none" />
          <div className="relative">
            <div className="text-[0.7rem] uppercase tracking-wider text-stone-400 font-medium">General Weighted Average</div>
            <div className="flex items-end gap-5 mt-3">
              <div>
                <div className="text-5xl font-display font-medium tabular text-stone-800 leading-none">
                  {gwa != null ? gwa.toFixed(2) : '—'}
                </div>
                <div className="text-xs text-stone-500 mt-2">
                  over {finalized.length} completed course{finalized.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="mb-1">
                <span className={`badge ${standingBadgeCls}`}>
                  <Icon name={standingIcon} size={10} /> {standing.label}
                </span>
              </div>
            </div>
            <div className="mt-5">
              <div className="relative h-2 rounded-full bg-beige-200 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-olive-400 via-khaki-300 to-red-300" style={{ width: '100%' }} />
                {gwa != null && (
                  <div className="absolute -top-0.5 w-1 h-3 bg-stone-900 rounded-sm shadow"
                    style={{ left: `${Math.min(100, Math.max(0, ((gwa - 1) / 4) * 100))}%`, transform: 'translateX(-50%)' }} />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-stone-400 mt-1.5 tabular">
                <span>1.00</span><span>2.00</span><span>3.00</span><span>5.00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile label="This term" value={`${activeEnrollments.length}`} hint={`courses · ${totalUnits} units`} icon="book-open" tone="olive" />
          <StatTile label="Completed" value={`${finalized.length}`} hint={`across ${new Set(finalized.map((e: any) => e.term_name)).size} terms`} icon="award" tone="khaki" />
          <StatTile label="Active block" value={user?.blockLabel || '—'} hint="cohort" icon="layout-grid" tone="olive" />

          <div className="card sm:col-span-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[0.7rem] uppercase tracking-wider text-stone-400 font-medium">Term progress</div>
                <div className="text-sm text-stone-700 mt-0.5">
                  {weekInfo ? `Week ${weekInfo.week} of ${weekInfo.total}` : 'No active term'}
                </div>
              </div>
              {weekInfo && <div className="text-sm font-medium text-olive-500 tabular">{Math.round(weekInfo.pct * 100)}%</div>}
            </div>
            <ProgressBar value={weekInfo ? weekInfo.pct * 100 : 0} />
            {weekInfo && (
              <div className="mt-3 flex justify-between text-[10px] text-stone-400 uppercase tracking-wider">
                <span>{weekInfo.startStr} · Start</span>
                <span className="text-stone-500 font-medium">↑ Today</span>
                <span>{weekInfo.endStr} · Finals</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today's classes */}
      <div>
        <SectionTitle
          title="Today's classes"
          tag={tCode ? new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Weekend'}
          action={<Link to="/student/schedule" className="text-xs text-olive-400 hover:text-olive-600 font-medium flex items-center gap-1">Full schedule <Icon name="arrow-right" size={11} /></Link>}
        />
        {todays.length === 0 ? (
          <div className="card p-0"><EmptyState icon="calendar" title="No classes today" message="Enjoy your day." /></div>
        ) : (
          <div className="card p-0 overflow-hidden">
            {todays.map((e: any, i: number) => (
              <div key={e.id} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-beige-200' : ''}`}>
                <div className="text-center w-14 flex-shrink-0">
                  <div className="font-mono text-sm font-semibold tabular text-stone-800 tracking-tight">{e.start_time?.slice(0, 5)}</div>
                  <div className="text-[10px] text-stone-400">to {e.end_time?.slice(0, 5)}</div>
                </div>
                <div className="w-1 h-10 rounded-full bg-olive-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs font-semibold text-olive-500">{e.course_code}</span>
                    <span className="font-medium text-stone-800 text-sm truncate">{e.course_title}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3">
                    {e.room && <span className="flex items-center gap-1"><Icon name="map-pin" size={11} /> {e.room}</span>}
                    {e.faculty_name && <span className="flex items-center gap-1"><Icon name="user" size={11} /> {e.faculty_name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current courses */}
      <div>
        <SectionTitle title="Current courses" tag={`${activeEnrollments.length} enrolled`}
          action={<Link to="/student/grades" className="text-xs text-olive-400 hover:text-olive-600 font-medium flex items-center gap-1">All grades <Icon name="arrow-right" size={11} /></Link>} />
        {activeEnrollments.length === 0 ? (
          <div className="card p-0"><EmptyState icon="book-open" title="No active enrollments" message="You aren't enrolled in any courses this term." /></div>
        ) : (
          <DataTable headers={[
            { label: 'Course' }, { label: 'Section' }, { label: 'Faculty' },
            { label: 'Schedule' }, { label: 'Status', align: 'right' },
          ]}>
            {activeEnrollments.map((e: any) => (
              <tr key={e.id} className="hover:bg-beige-50 transition-colors">
                <td className="table-td">
                  <span className="font-mono text-xs text-olive-500 font-semibold">{e.course_code}</span>
                  <span className="ml-2">{e.course_title}</span>
                </td>
                <td className="table-td font-mono text-stone-500 text-xs">{e.section_code}</td>
                <td className="table-td text-stone-500">{e.faculty_name}</td>
                <td className="table-td text-stone-500 text-xs">
                  {e.day_of_week
                    ? <><span className="font-mono">{e.day_of_week}</span> · {e.start_time?.slice(0,5)}–{e.end_time?.slice(0,5)}</>
                    : <span className="text-stone-300">—</span>}
                </td>
                <td className="table-td text-right"><span className="badge badge-enrolled">Enrolled</span></td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
