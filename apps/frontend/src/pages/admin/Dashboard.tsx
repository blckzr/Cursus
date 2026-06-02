import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getUsers, getPrograms, getSections, getTerms, getEnrollments } from '../../api';
import PageHeader from '../../components/PageHeader';
import SectionTitle from '../../components/SectionTitle';
import ProgressBar from '../../components/ProgressBar';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';

const isActive = (v: unknown) => v === true || v === 'true';
const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: users = [] }       = useQuery({ queryKey: ['users'],       queryFn: () => getUsers() });
  const { data: programs = [] }    = useQuery({ queryKey: ['programs'],    queryFn: () => getPrograms() });
  const { data: sections = [] }    = useQuery({ queryKey: ['sections'],    queryFn: () => getSections() });
  const { data: terms = [] }       = useQuery({ queryKey: ['terms'],       queryFn: () => getTerms() });
  const { data: enrollments = [] } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });

  const students = users.filter((u: any) => u.role === 'student');
  const faculty  = users.filter((u: any) => u.role === 'faculty');
  const activeTerm = terms.find((t: any) => isActive(t.is_active));
  const activeSections = sections.filter((s: any) => s.term_name === activeTerm?.name);
  const enrolledCount = enrollments.filter((e: any) => e.status === 'enrolled').length;

  // Students per program
  const progCounts: Record<string, number> = {};
  students.forEach((u: any) => { if (u.program_code) progCounts[u.program_code] = (progCounts[u.program_code] || 0) + 1; });
  const topPrograms = Object.entries(progCounts)
    .map(([code, count]) => ({ code, count, name: programs.find((p: any) => p.code === code)?.name || code }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxProg = topPrograms[0]?.count || 1;

  // Cumulative GWA across finalized enrollments
  const finalized = enrollments.filter((e: any) => e.letter_grade);
  const avgGWA = finalized.length
    ? finalized.reduce((s: number, e: any) => s + Number(e.letter_grade), 0) / finalized.length
    : null;

  // Active-term progress
  let weekInfo: { week: number; total: number; pct: number } | null = null;
  if (activeTerm) {
    const start = new Date(activeTerm.start_date).getTime();
    const end = new Date(activeTerm.end_date).getTime();
    const total = Math.max(1, Math.round((end - start) / WEEK));
    const week = Math.max(0, Math.min(total, Math.round((Date.now() - start) / WEEK)));
    weekInfo = { week, total, pct: week / total };
  }

  const recent = [...enrollments]
    .sort((a: any, b: any) => String(b.enrolled_at).localeCompare(String(a.enrolled_at)))
    .slice(0, 6);

  const quickActions = [
    { label: 'New user',       icon: 'users',          to: '/admin/users' },
    { label: 'New course',     icon: 'book-open',      to: '/admin/courses' },
    { label: 'New section',    icon: 'school',         to: '/admin/sections' },
    { label: 'Enroll student', icon: 'clipboard-list', to: '/admin/enrollments' },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Registrar"
        title="System overview"
        subtitle={activeTerm ? `${activeTerm.name} · Cursus is current as of today.` : 'No active term is set.'}
        stats={[
          { label: 'Students',            value: students.length,      icon: 'users' },
          { label: 'Faculty',             value: faculty.length,       icon: 'user-check',     tone: 'khaki' },
          { label: 'Active sections',     value: activeSections.length, icon: 'school' },
          { label: 'Current enrollments', value: enrolledCount,        icon: 'clipboard-list', tone: 'olive' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Program distribution + quick actions */}
        <div className="lg:col-span-2">
          <SectionTitle title="Students by program" tag={`${students.length} total`}
            action={<button className="text-xs text-olive-400 hover:text-olive-600 font-medium" onClick={() => navigate('/admin/programs')}>Manage →</button>} />
          <div className="card space-y-3">
            {topPrograms.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-4">No students assigned to programs yet.</p>
            ) : topPrograms.map(p => (
              <div key={p.code} className="flex items-center gap-3">
                <div className="w-14 sm:w-20 flex-shrink-0 font-mono text-xs font-semibold text-olive-500 truncate">{p.code}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="text-stone-700 truncate font-medium">{p.name}</span>
                    <span className="tabular text-stone-500 flex-shrink-0">{p.count} <span className="text-stone-400 hidden sm:inline">students</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-beige-200 overflow-hidden">
                    <div className="h-full bg-olive-300 rounded-full transition-all" style={{ width: `${(p.count / maxProg) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
            {quickActions.map(a => (
              <button key={a.to} onClick={() => navigate(a.to)}
                className="card hover:border-olive-200 hover:shadow-pop transition-all !p-3 text-left flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-olive-50 text-olive-500 flex items-center justify-center flex-shrink-0"><Icon name={a.icon} size={16} /></span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{a.label}</div>
                  <div className="text-[11px] text-stone-400 flex items-center gap-1">Open <Icon name="arrow-right" size={9} /></div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Term snapshot + GWA */}
        <div className="space-y-4">
          <SectionTitle title="Term snapshot" />
          <div className="card">
            <div className="text-[10px] uppercase tracking-widest text-olive-400 font-semibold">Active term</div>
            <div className="text-base font-medium text-stone-800 mt-0.5">{activeTerm?.name || '—'}</div>
            {activeTerm && (
              <div className="text-xs text-stone-500 mt-1">
                {new Date(activeTerm.start_date).toLocaleDateString()} → {new Date(activeTerm.end_date).toLocaleDateString()}
              </div>
            )}
            {weekInfo && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-stone-600">Week {weekInfo.week} of {weekInfo.total}</span>
                  <span className="text-olive-500 font-semibold tabular">{Math.round(weekInfo.pct * 100)}%</span>
                </div>
                <ProgressBar value={weekInfo.pct * 100} />
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-beige-200 grid grid-cols-3 gap-2 text-center">
              <div><div className="text-base font-semibold tabular">{activeSections.length}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Sections</div></div>
              <div><div className="text-base font-semibold tabular">{programs.length}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Programs</div></div>
              <div><div className="text-base font-semibold tabular">{terms.length}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Terms</div></div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Cumulative GWA</div>
                <div className="text-xs text-stone-500 mt-0.5">across {finalized.length} finalized grades</div>
              </div>
              <div className="text-3xl font-display tabular font-medium text-olive-500">{avgGWA != null ? avgGWA.toFixed(2) : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent enrollments */}
      <div>
        <SectionTitle title="Recent enrollments" tag="latest 6"
          action={<button className="text-xs text-olive-400 hover:text-olive-600 font-medium" onClick={() => navigate('/admin/enrollments')}>See all →</button>} />
        <div className="card p-0 overflow-hidden">
          {recent.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No enrollments yet.</p>
          ) : recent.map((e: any, i: number) => (
            <div key={e.id} className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 ${i > 0 ? 'border-t border-beige-200' : ''}`}>
              <Avatar name={e.student_name} size={32} tone="beige" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{e.student_name}</div>
                <div className="text-[11px] text-stone-500 truncate">{e.student_email}</div>
              </div>
              <div className="hidden sm:block min-w-0 max-w-[280px]">
                <div className="text-sm text-stone-700 truncate">
                  <span className="font-mono text-olive-500 text-xs font-semibold">{e.course_code}</span> · {e.course_title}
                </div>
                <div className="text-[11px] text-stone-400 truncate">{e.term_name}</div>
              </div>
              <span className={`flex-shrink-0 ${e.status === 'completed' ? 'badge badge-completed' : e.status === 'dropped' ? 'badge badge-dropped' : 'badge badge-enrolled'}`}>
                {e.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
