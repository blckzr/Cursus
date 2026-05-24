import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { getSections, getTerms, getGradebook } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import SectionTitle from '../../components/SectionTitle';
import EmptyState from '../../components/EmptyState';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import FacultySectionCard from './SectionCard';

const isActive = (v: unknown) => v === true || v === 'true';

/** Today's weekday code mapped to the schedule format ('M','T','W','Th','F'). */
function todayCode(): string {
  const map = ['', 'M', 'T', 'W', 'Th', 'F'];
  const d = new Date().getDay();
  return map[d] || '';
}

function meetsToday(daysStr: string | undefined | null, code: string): boolean {
  if (!daysStr || !code) return false;
  if (code === 'Th') return /Th/.test(daysStr);
  return daysStr.replace(/Th/g, '').includes(code);
}

export default function FacultyDashboard() {
  const { user } = useAuth();
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });
  const { data: terms = [] }    = useQuery({ queryKey: ['terms'],    queryFn: () => getTerms() });

  const activeTerm = terms.find((t: any) => isActive(t.is_active));
  const mySections: any[] = useMemo(
    () => sections.filter((s: any) => s.term_name === activeTerm?.name),
    [sections, activeTerm],
  );

  // Fetch gradebook for each active section to aggregate stats
  const gradebookQueries = useQueries({
    queries: mySections.map(s => ({
      queryKey: ['gradebook', s.id],
      queryFn: () => getGradebook(s.id),
    })),
  });

  const totalStudents = gradebookQueries.reduce(
    (sum, q: any) => sum + ((q.data?.students?.length) || 0), 0,
  );
  const allGrades = gradebookQueries.flatMap(
    (q: any) => (q.data?.students || []).map((s: any) => s.computedGrade).filter((g: any) => g != null),
  );
  const overallAvg = allGrades.length
    ? allGrades.reduce((a, b) => a + b, 0) / allGrades.length
    : null;
  const totalAtRisk = gradebookQueries.reduce(
    (sum, q: any) => sum + ((q.data?.students || []).filter((s: any) => s.computedGrade != null && s.computedGrade < 75).length || 0), 0,
  );

  const tCode = todayCode();
  const todays = mySections
    .filter(s => meetsToday(s.day_of_week, tCode))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  // Top at-risk students across all sections
  const atRiskStudents = useMemo(() => {
    const out: { student: any; section: any; grade: number }[] = [];
    gradebookQueries.forEach((q: any, i) => {
      const section = mySections[i];
      (q.data?.students || []).forEach((st: any) => {
        if (st.computedGrade != null && st.computedGrade < 75) {
          out.push({ student: st, section, grade: st.computedGrade });
        }
      });
    });
    return out.sort((a, b) => a.grade - b.grade).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradebookQueries.map(q => q.dataUpdatedAt).join(','), mySections]);

  const firstName = user?.fullName.split(' ')[0] || '';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Good day, ${firstName}`}
        title="Your teaching dashboard"
        subtitle={`${mySections.length} active section${mySections.length === 1 ? '' : 's'} · ${activeTerm?.name || 'No active term'}`}
        stats={[
          { label: 'Active sections', value: mySections.length, icon: 'layout-grid' },
          { label: 'Students',        value: totalStudents,     icon: 'users' },
          { label: 'Class average',   value: overallAvg != null ? overallAvg.toFixed(1) : '—', icon: 'trending-up', tone: 'khaki' },
          { label: 'Need attention',  value: totalAtRisk,       icon: 'alert-triangle', tone: totalAtRisk > 0 ? 'red' : 'olive' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's classes */}
        <div className="lg:col-span-2">
          <SectionTitle title="Today's classes" tag={tCode ? `${new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Weekend'} />
          {todays.length === 0 ? (
            <div className="card p-0"><EmptyState icon="calendar" title="No classes today" message="Enjoy your day off." /></div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {todays.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/faculty/sections/${s.id}`}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-beige-50 text-left transition-colors ${i > 0 ? 'border-t border-beige-200' : ''}`}
                >
                  <div className="text-center w-14 flex-shrink-0">
                    <div className="font-mono text-sm font-semibold tabular text-stone-800 tracking-tight">{s.start_time?.slice(0, 5)}</div>
                    <div className="text-[10px] text-stone-400">to {s.end_time?.slice(0, 5)}</div>
                  </div>
                  <div className="w-1 h-10 rounded-full bg-olive-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs font-semibold text-olive-500">{s.section_code}</span>
                      <span className="font-medium text-stone-800 text-sm truncate">{s.course_title}</span>
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3">
                      {s.room && <span className="flex items-center gap-1"><Icon name="map-pin" size={11} /> {s.room}</span>}
                    </div>
                  </div>
                  <Icon name="chevron-right" size={14} className="text-stone-300" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* At-risk students */}
        <div>
          <SectionTitle title="Needs attention" tag={`${atRiskStudents.length} student${atRiskStudents.length === 1 ? '' : 's'}`} />
          <div className="card p-0 overflow-hidden">
            {atRiskStudents.length === 0 ? (
              <EmptyState icon="award" title="No at-risk students" message="Everyone is on track." />
            ) : atRiskStudents.map((a, i) => (
              <Link
                key={`${a.section.id}-${a.student.enrollmentId}`}
                to={`/faculty/sections/${a.section.id}`}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-beige-50 text-left transition-colors ${i > 0 ? 'border-t border-beige-200' : ''}`}
              >
                <Avatar name={a.student.studentName} size={32} tone="khaki" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{a.student.studentName}</div>
                  <div className="text-[11px] text-stone-500 font-mono truncate">{a.section.section_code}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular text-red-500">{a.grade.toFixed(1)}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">grade</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* My sections grid */}
      <div>
        <SectionTitle title="My sections" tag={`${mySections.length} this term`}
          action={<Link to="/faculty/sections" className="text-xs text-olive-400 hover:text-olive-600 font-medium flex items-center gap-1">See all <Icon name="arrow-right" size={11} /></Link>} />
        {mySections.length === 0 ? (
          <div className="card p-0"><EmptyState icon="school" title="No sections" message="Nothing assigned for the active term." /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mySections.map(s => <FacultySectionCard key={s.id} section={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
