import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudentGrades, downloadTranscript } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/DataTable';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const isActive = (v: unknown) => v === true || v === 'true';

const PH_GRADE_SCALE = [
  { v: '1.00', label: 'Excellent' },
  { v: '1.25', label: 'Superior' },
  { v: '1.50', label: 'Very Good' },
  { v: '1.75', label: 'Good' },
  { v: '2.00', label: 'Satisfactory' },
  { v: '2.25', label: 'Average' },
  { v: '2.50', label: 'Fair' },
  { v: '2.75', label: 'Passing' },
  { v: '3.00', label: 'Conditional' },
  { v: '5.00', label: 'Failed' },
];

function termGWA(items: any[]): number | null {
  const finalized = items.filter(e => e.letter_grade);
  if (!finalized.length) return null;
  const sumU = finalized.reduce((s, e) => s + Number(e.units || 3), 0);
  if (!sumU) return null;
  return finalized.reduce((s, e) => s + Number(e.letter_grade) * Number(e.units || 3), 0) / sumU;
}

export default function StudentGrades() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: () => getStudentGrades(user!.id),
    enabled: !!user,
  });
  const [termFilter, setTermFilter] = useState('all');

  const handleDownload = async () => {
    try {
      await downloadTranscript();
      toast.push({ tone: 'success', title: 'Transcript downloaded' });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed' });
    }
  };

  const grouped = useMemo(() => {
    const byTerm: Record<string, { term: any; items: any[] }> = {};
    grades.forEach((e: any) => {
      const key = e.term_id || e.term_name;
      if (!byTerm[key]) byTerm[key] = { term: { id: e.term_id, name: e.term_name, is_active: e.term_is_active, end_date: e.end_date }, items: [] };
      byTerm[key].items.push(e);
    });
    return Object.values(byTerm).sort((a, b) => String(b.term.end_date || '').localeCompare(String(a.term.end_date || '')));
  }, [grades]);

  const filtered = termFilter === 'all' ? grouped : grouped.filter(g => g.term.id === termFilter);

  return (
    <div>
      <PageHeader
        eyebrow="Academic record"
        title="My grades"
        subtitle="Your complete grade record across every term — grouped chronologically."
        action={
          <button onClick={handleDownload} className="btn-secondary flex items-center gap-2">
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Download transcript</span>
            <span className="sm:hidden">Transcript</span>
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-7">
          {[0, 1].map(i => (
            <div key={i}>
              <div className="flex items-end justify-between mb-3 px-1">
                <div className="space-y-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-5 w-48" /></div>
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card p-0"><EmptyState icon="bar-chart" title="No grades yet" message="You aren't enrolled in any sections yet." /></div>
      ) : (
        <>
          {/* Horizontally scroll the chip row on narrow viewports rather than wrapping. */}
          <div className="-mx-3 px-3 sm:mx-0 sm:px-0 mb-5 overflow-x-auto scrollable">
            <div className="flex items-center gap-2 w-max sm:w-auto sm:flex-wrap">
              <Chip active={termFilter === 'all'} onClick={() => setTermFilter('all')}>All terms</Chip>
              {grouped.map(g => g.term.id && (
                <Chip key={g.term.id} active={termFilter === g.term.id} onClick={() => setTermFilter(g.term.id)}>
                  {g.term.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-7">
            {filtered.map(g => {
              const gwa = termGWA(g.items);
              const activeTerm = isActive(g.term.is_active);
              const units = g.items.reduce((s, e) => s + Number(e.units || 0), 0);
              return (
                <section key={g.term.id || g.term.name}>
                  <div className="flex items-end justify-between mb-3 px-1 gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Term</div>
                      <h2 className="text-base font-semibold text-stone-800 truncate">{g.term.name}</h2>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-5">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold whitespace-nowrap">
                          {activeTerm ? 'In progress' : 'Final GWA'}
                        </div>
                        <div className="text-xl font-display tabular font-medium text-stone-800">
                          {gwa != null ? gwa.toFixed(2) : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Units</div>
                        <div className="text-xl font-display tabular font-medium text-stone-700">{units}</div>
                      </div>
                    </div>
                  </div>

                  <DataTable headers={[
                    { label: 'Course' }, { label: 'Section' },
                    { label: 'Units', align: 'center' },
                    { label: 'Faculty' }, { label: 'Status' },
                    { label: 'Grade', align: 'right' },
                  ]}>
                    {g.items.map((e: any) => (
                      <tr key={e.id} className="hover:bg-beige-50 transition-colors">
                        <td className="table-td">
                          <span className="font-mono text-xs text-olive-500 font-semibold">{e.course_code}</span>
                          <span className="ml-2">{e.course_title}</span>
                        </td>
                        <td className="table-td font-mono text-stone-500 text-xs">{e.section_code}</td>
                        <td className="table-td text-center tabular">{e.units}</td>
                        <td className="table-td text-stone-500 text-xs">{e.faculty_name}</td>
                        <td className="table-td">
                          {e.status === 'enrolled'  ? <span className="badge badge-enrolled">Enrolled</span>
                            : e.status === 'dropped' ? <span className="badge badge-dropped">Dropped</span>
                            : <span className="badge badge-completed">Completed</span>}
                        </td>
                        <td className="table-td text-right">
                          {e.letter_grade ? (
                            <div className="leading-tight">
                              <span className="font-display text-lg font-medium text-olive-600 tabular">{e.letter_grade}</span>
                              {e.numeric_grade != null && (
                                <span className="text-stone-400 text-[11px] ml-1 tabular">({Number(e.numeric_grade).toFixed(2)})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-stone-400 text-sm">In progress</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </section>
              );
            })}
          </div>

          {/* PH grade scale */}
          <details className="mt-8 group">
            <summary className="cursor-pointer text-xs text-stone-500 font-medium uppercase tracking-wider inline-flex items-center gap-1.5">
              <Icon name="info" size={12} /> Philippine grade scale
            </summary>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {PH_GRADE_SCALE.map(g => (
                <div key={g.v} className="bg-white border border-khaki-100 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="font-display tabular font-medium text-stone-800">{g.v}</span>
                  <span className="text-stone-500">{g.label}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
