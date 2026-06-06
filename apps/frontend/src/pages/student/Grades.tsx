import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudentGrades, downloadTranscript, createAppeal, listMyAppeals, type AppealRow } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/DataTable';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

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
  const qc = useQueryClient();
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: () => getStudentGrades(user!.id),
    enabled: !!user,
  });
  // Pull existing appeals so we can mark already-appealed grades inline.
  const { data: appeals = [] } = useQuery<AppealRow[]>({
    queryKey: ['my-appeals'],
    queryFn:  listMyAppeals,
  });
  const appealByEnrollment = useMemo(() => {
    const m = new Map<string, AppealRow>();
    for (const a of appeals) m.set(a.enrollment_id, a);
    return m;
  }, [appeals]);

  const [termFilter, setTermFilter] = useState('all');
  const [appealTarget, setAppealTarget] = useState<any | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealErr,    setAppealErr]    = useState('');

  const appealMut = useMutation({
    mutationFn: () => createAppeal({ enrollmentId: appealTarget!.id, reason: appealReason }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['my-appeals'] });
      setAppealTarget(null); setAppealReason(''); setAppealErr('');
      toast.push({ tone: 'success', title: 'Appeal filed', message: 'Your faculty has been notified.' });
    },
    onError:    (e: unknown) => setAppealErr(parseApiError(e).message),
  });

  const handleDownload = async () => {
    try {
      await downloadTranscript();
      toast.push({ tone: 'success', title: 'Transcript downloaded' });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed' });
    }
  };

  // Appeals are allowed within 14 days of finalize. We compute eligibility
  // client-side so the button can disable; the backend re-checks on submit.
  const APPEAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  const canAppeal = (e: any) =>
    e.letter_grade != null && e.finalized_at != null
    && Date.now() - new Date(e.finalized_at).getTime() <= APPEAL_WINDOW_MS
    && !appealByEnrollment.has(e.id);

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

                  {/*
                    Mobile keeps Course + Grade — the whole point of "my grades".
                    Section / Faculty / Status collapse below md; Units below sm.
                  */}
                  <DataTable
                    pageSize={10}
                    headers={[
                      { label: 'Course' },
                      { label: 'Section', hideBelow: 'md' },
                      { label: 'Units',   align: 'center', hideBelow: 'sm' },
                      { label: 'Faculty', hideBelow: 'lg' },
                      { label: 'Status',  hideBelow: 'md' },
                      { label: 'Grade',   align: 'right' },
                    ]}
                  >
                    {g.items.map((e: any) => (
                      <tr key={e.id} className="hover:bg-beige-50 transition-colors">
                        <td className="table-td">
                          <span className="font-mono text-xs text-olive-500 font-semibold">{e.course_code}</span>
                          <span className="ml-2">{e.course_title}</span>
                        </td>
                        <td className="table-td font-mono text-stone-500 text-xs hidden md:table-cell">{e.section_code}</td>
                        <td className="table-td text-center tabular hidden sm:table-cell">{e.units}</td>
                        <td className="table-td text-stone-500 text-xs hidden lg:table-cell">{e.faculty_name}</td>
                        <td className="table-td hidden md:table-cell">
                          {e.status === 'enrolled'  ? <span className="badge badge-enrolled">Enrolled</span>
                            : e.status === 'dropped' ? <span className="badge badge-dropped">Dropped</span>
                            : <span className="badge badge-completed">Completed</span>}
                        </td>
                        <td className="table-td text-right">
                          {e.letter_grade ? (
                            <div className="leading-tight flex items-center justify-end gap-2">
                              <div>
                                <span className="font-display text-lg font-medium text-olive-600 tabular">{e.letter_grade}</span>
                                {e.numeric_grade != null && (
                                  <span className="text-stone-400 text-[11px] ml-1 tabular hidden sm:inline">({Number(e.numeric_grade).toFixed(2)})</span>
                                )}
                              </div>
                              {appealByEnrollment.has(e.id) ? (
                                <span title="Appeal filed" className="badge badge-amber text-[10px]">
                                  <Icon name="alert-triangle" size={10} /> Appealed
                                </span>
                              ) : canAppeal(e) && (
                                <button
                                  className="btn-icon !w-7 !h-7 hover:!text-olive-600 border border-transparent hover:border-khaki-200"
                                  title="File a grade appeal"
                                  onClick={() => { setAppealErr(''); setAppealReason(''); setAppealTarget(e); }}
                                >
                                  <Icon name="message" size={12} />
                                </button>
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

      {/* ── Appeal modal ────────────────────────────────────────────── */}
      {appealTarget && (
        <Modal
          title="File a grade appeal"
          subtitle={`${appealTarget.course_code} · ${appealTarget.course_title}`}
          onClose={() => setAppealTarget(null)}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-beige-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Current grade</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-display text-xl font-medium text-stone-800 tabular">{appealTarget.letter_grade}</span>
                  {appealTarget.numeric_grade != null && (
                    <span className="text-xs text-stone-400 tabular">({Number(appealTarget.numeric_grade).toFixed(2)})</span>
                  )}
                </div>
              </div>
              <div className="bg-beige-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Faculty</div>
                <div className="mt-0.5 text-sm font-medium text-stone-800">{appealTarget.faculty_name ?? '—'}</div>
              </div>
            </div>

            <div>
              <label className="label">Reason for appeal</label>
              <textarea
                className="input min-h-[120px]"
                value={appealReason}
                onChange={e => setAppealReason(e.target.value)}
                placeholder="Explain in your own words why you believe the grade should be reviewed. Include any specific assessments or events the faculty should reconsider."
                autoFocus
              />
              <p className="text-[11px] text-stone-400 mt-1">{appealReason.length} / 2000 characters · at least 20 required</p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
              <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                You can only file one appeal per grade. The faculty for this section will be notified and asked to respond.
                Track progress on the <strong>My Appeals</strong> page.
              </span>
            </div>

            {appealErr && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" /> {appealErr}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setAppealTarget(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => { setAppealErr(''); appealMut.mutate(); }}
                disabled={appealMut.isPending || appealReason.trim().length < 20}
              >
                {appealMut.isPending ? 'Filing…' : 'File appeal'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
