import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTerms, createTerm, updateTerm, openTerm,
  getSections, getEnrollments, getPrograms, getBlocks, getWishlistDemand,
  previewTbaAutoPass, autoPassTbaSections,
  type TbaAutoPassPreview,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import CardGridSkeleton from '../../components/CardGridSkeleton';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';

const isActive = (v: unknown) => v === true || v === 'true';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SEM_LABEL: Record<string, string> = { '1': '1st Sem', '2': '2nd Sem', summer: 'Summer' };

export default function Terms() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: terms = [], isLoading } = useQuery({ queryKey: ['terms'], queryFn: getTerms });
  const { data: sections = [] }    = useQuery({ queryKey: ['sections'],    queryFn: () => getSections() });
  const { data: enrollments = [] } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });

  const [showCreate, setShowCreate] = useState(false);
  const [editTerm, setEditTerm] = useState<Record<string, string> | null>(null);
  const [openWizardTerm, setOpenWizardTerm] = useState<Record<string, any> | null>(null);
  const [demandTerm, setDemandTerm] = useState<Record<string, any> | null>(null);
  const [tbaTerm,    setTbaTerm]    = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState({ name: '', semester: '1', startDate: '', endDate: '', isActive: 'false' });
  const [editActive, setEditActive] = useState('false');
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const resetErr = () => { setErr(''); setFieldErrors({}); };

  const createMut = useMutation({
    mutationFn: () => createTerm({ ...form, isActive: form.isActive === 'true' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] });
      setShowCreate(false);
      setForm({ name: '', semester: '1', startDate: '', endDate: '', isActive: 'false' });
      resetErr();
      toast.push({ tone: 'success', title: 'Term created' });
    },
    onError: (e: unknown) => { const p = parseApiError(e, 'Failed to create term'); setErr(p.message); setFieldErrors(p.fields); },
  });

  const updateMut = useMutation({
    mutationFn: () => updateTerm(editTerm!.id, { isActive: editActive === 'true' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] });
      setEditTerm(null); resetErr();
      toast.push({ tone: 'success', title: 'Term updated' });
    },
    onError: (e: unknown) => { const p = parseApiError(e, 'Failed to update term'); setErr(p.message); setFieldErrors(p.fields); },
  });

  const termStats = (t: any) => {
    const secs = sections.filter((s: any) => s.term_name === t.name).length;
    const enr  = enrollments.filter((e: any) => e.term_name === t.name).length;
    const start = new Date(t.start_date).getTime();
    const end   = new Date(t.end_date).getTime();
    const total = Math.max(1, Math.round((end - start) / WEEK));
    const week  = isActive(t.is_active)
      ? Math.max(0, Math.min(total, Math.round((Date.now() - start) / WEEK)))
      : total;
    return { secs, enr, weeks: `${week}/${total}` };
  };

  return (
    <div>
      <PageHeader
        eyebrow="Academic calendar"
        title="Terms"
        subtitle="Manage academic terms and the active period. Use 'Open term' to bulk-create sections and enrollments from the curriculum."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); resetErr(); }}><Icon name="plus" size={14} /> New term</button>}
      />

      {isLoading ? (
        <CardGridSkeleton count={4} cols={2} />
      ) : terms.length === 0 ? (
        <div className="card p-0"><EmptyState icon="calendar" title="No terms yet" message="Create the first academic term." /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {terms.map((t: any) => {
            const st = termStats(t);
            const active = isActive(t.is_active);
            return (
              <div key={t.id} className={`card ${active ? 'border-olive-300 ring-1 ring-olive-200' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">
                      {active ? 'Active term' : 'Past term'} · {SEM_LABEL[t.semester] || t.semester}
                    </div>
                    <h3 className="font-medium text-stone-800 mt-0.5">{t.name}</h3>
                    <p className="text-xs text-stone-500 mt-1.5">
                      {new Date(t.start_date).toLocaleDateString()} → {new Date(t.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {active && <span className="badge badge-completed">Current</span>}
                    <button className="btn-icon" title="Edit"
                      onClick={() => { setEditTerm(t); setEditActive(String(t.is_active)); resetErr(); }}>
                      <Icon name="pencil" size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-beige-200 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-base font-semibold tabular">{st.secs}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Sections</div></div>
                  <div><div className="text-base font-semibold tabular">{st.enr}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Enrollments</div></div>
                  <div><div className="text-base font-semibold tabular">{st.weeks}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Weeks</div></div>
                </div>
                {active && (
                  <button
                    className="btn-secondary w-full mt-3 flex items-center justify-center gap-2"
                    onClick={() => setOpenWizardTerm(t)}
                  >
                    <Icon name="sparkles" size={14} />
                    <span className="hidden sm:inline">Open term — generate sections &amp; enrollments</span>
                    <span className="sm:hidden">Open term</span>
                  </button>
                )}
                {!active && (
                  <>
                    <button
                      className="btn-ghost w-full mt-3 flex items-center justify-center gap-2 border border-khaki-200"
                      onClick={() => setDemandTerm(t)}
                    >
                      <Icon name="star" size={14} />
                      See wishlist demand
                    </button>
                    <button
                      className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 border border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={() => setTbaTerm(t)}
                      title="If any sections still have no faculty assigned, auto-pass the enrolled students (1.00)."
                    >
                      <Icon name="award" size={14} />
                      Auto-pass TBA sections
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="New term" onClose={() => { setShowCreate(false); resetErr(); }}>
          <div className="space-y-4">
            <InputField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="AY 2025–2026, 1st Semester" error={fieldErrors.name} />
            <SelectField label="Semester" value={form.semester}
              onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} error={fieldErrors.semester}
              hint="Which curriculum slot this term uses. Drives auto-section generation.">
              <option value="1">1st Semester</option>
              <option value="2">2nd Semester</option>
              <option value="summer">Summer</option>
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Start date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} error={fieldErrors.startDate} />
              <InputField label="End date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} error={fieldErrors.endDate} />
            </div>
            <SelectField label="Active?" value={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.value }))}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); createMut.mutate(); }} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create term'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editTerm && (
        <Modal title={`Edit — ${editTerm.name}`} onClose={() => { setEditTerm(null); resetErr(); }}>
          <div className="space-y-4">
            <SelectField label="Active?" value={editActive} onChange={e => setEditActive(e.target.value)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditTerm(null); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); updateMut.mutate(); }} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {openWizardTerm && (
        <OpenTermWizard term={openWizardTerm} onClose={() => setOpenWizardTerm(null)} onDone={() => {
          qc.invalidateQueries({ queryKey: ['sections'] });
          qc.invalidateQueries({ queryKey: ['enrollments'] });
          qc.invalidateQueries({ queryKey: ['blocks'] });
          setOpenWizardTerm(null);
        }} />
      )}

      {demandTerm && (
        <DemandModal term={demandTerm} onClose={() => setDemandTerm(null)} />
      )}

      {tbaTerm && (
        <TbaAutoPassModal
          term={tbaTerm}
          onClose={() => setTbaTerm(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['enrollments'] });
            qc.invalidateQueries({ queryKey: ['sections'] });
            setTbaTerm(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Open Term Wizard
// ============================================================================

function OpenTermWizard({ term, onClose, onDone }: { term: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: () => getPrograms() });
  const { data: blocks = [] }   = useQuery({ queryKey: ['blocks'],   queryFn: () => getBlocks() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ sectionsCreated: number; sectionsSkipped: number; enrollmentsCreated: number } | null>(null);

  // Default: select every program once both queries land.
  if (selected.size === 0 && programs.length > 0) {
    setSelected(new Set(programs.map((p: any) => p.id)));
  }

  const blocksFor = (programId: string) => blocks.filter((b: any) => b.program_id === programId);
  const studentsFor = (programId: string) =>
    blocksFor(programId).reduce((s: number, b: any) => s + (b.student_count || 0), 0);

  const mut = useMutation({
    mutationFn: () => openTerm(term.id, { programIds: [...selected] }),
    onSuccess: (res: any) => {
      setResult(res);
      toast.push({
        tone: res.sectionsCreated + res.enrollmentsCreated === 0 ? 'info' : 'success',
        title: 'Term opened',
        message: `${res.sectionsCreated} sections · ${res.enrollmentsCreated} enrollments`,
      });
    },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Open term failed', message: parseApiError(e).message }),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <Modal title={`Open term — ${term.name}`}
      subtitle="Bulk-creates one section per curriculum course per block, and enrolls every student in their block's sections."
      onClose={onClose} size="lg">
      <div className="space-y-4">
        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card text-center !py-4">
                <div className="text-3xl font-display tabular font-medium text-olive-500">{result.sectionsCreated}</div>
                <div className="text-xs text-stone-500 mt-1">Sections created</div>
              </div>
              <div className="card text-center !py-4">
                <div className="text-3xl font-display tabular font-medium text-stone-400">{result.sectionsSkipped}</div>
                <div className="text-xs text-stone-500 mt-1">Sections skipped (already existed)</div>
              </div>
              <div className="card text-center !py-4">
                <div className="text-3xl font-display tabular font-medium text-olive-500">{result.enrollmentsCreated}</div>
                <div className="text-xs text-stone-500 mt-1">Enrollments created</div>
              </div>
            </div>
            <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-600 flex items-start gap-2">
              <Icon name="info" size={14} className="mt-0.5 flex-shrink-0 text-stone-400" />
              <span>Next: head to <strong>Sections</strong> to assign faculty, day/time, and rooms to the TBA sections.</span>
            </div>
            <div className="flex justify-end pt-1">
              <button className="btn-primary" onClick={onDone}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              Curriculum slot: <span className="font-semibold">{SEM_LABEL[term.semester]}</span>.
              Uncheck any program you want to skip.
            </p>
            <div className="border border-khaki-200 rounded-lg max-h-72 overflow-y-auto scrollable divide-y divide-beige-200">
              {programs.map((p: any) => {
                const blocksCount = blocksFor(p.id).length;
                const studentCount = studentsFor(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-beige-50">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="font-mono text-xs font-semibold text-olive-600 w-16">{p.code}</span>
                    <span className="text-sm text-stone-800 flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-stone-500 tabular">{blocksCount} blocks · {studentCount} students</span>
                  </label>
                );
              })}
              {programs.length === 0 && <p className="text-sm text-stone-400 text-center py-6">Loading programs…</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary flex items-center gap-2" onClick={() => mut.mutate()}
                disabled={mut.isPending || selected.size === 0}>
                <Icon name="sparkles" size={14} />
                {mut.isPending ? 'Opening…' : `Open term for ${selected.size} program${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// Wishlist demand modal
// ============================================================================

interface DemandRow {
  courseId:     string;
  code:         string;
  title:        string;
  units:        number;
  programCode:  string | null;
  demand:       number;
  highPriority: number;
  byYearLevel:  { yearLevel: number; count: number }[];
  students:     {
    studentId:   string; studentName: string; userCode: string | null;
    yearLevel:   number | null; priority: number; notes: string | null;
  }[];
}

function DemandModal({ term, onClose }: { term: any; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery<DemandRow[]>({
    queryKey: ['wishlist-demand', term.id],
    queryFn:  () => getWishlistDemand(term.id),
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalDemand = rows.reduce((s, r) => s + r.demand, 0);
  const uniqueStudents = new Set(rows.flatMap(r => r.students.map(s => s.studentId))).size;

  return (
    <Modal
      title={`Wishlist demand — ${term.name}`}
      subtitle="What students are asking for, before sections are opened. Use this to decide how many sections of each course to provision."
      onClose={onClose}
      size="lg"
    >
      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No demand yet" message="Students haven't wishlisted any courses for this term." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center !py-3">
              <div className="text-2xl font-display tabular font-medium text-olive-500">{rows.length}</div>
              <div className="text-xs text-stone-500 mt-1">Courses wished</div>
            </div>
            <div className="card text-center !py-3">
              <div className="text-2xl font-display tabular font-medium text-olive-500">{totalDemand}</div>
              <div className="text-xs text-stone-500 mt-1">Total entries</div>
            </div>
            <div className="card text-center !py-3">
              <div className="text-2xl font-display tabular font-medium text-olive-500">{uniqueStudents}</div>
              <div className="text-xs text-stone-500 mt-1">Unique students</div>
            </div>
          </div>

          <div className="border border-beige-200 rounded-lg max-h-[480px] overflow-y-auto scrollable">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-beige-50 z-10">
                <tr>
                  <th className="table-th !py-2">Course</th>
                  <th className="table-th !py-2 text-center" style={{ width: 70 }}>Demand</th>
                  <th className="table-th !py-2 text-center hidden sm:table-cell" style={{ width: 70 }}>High prio</th>
                  <th className="table-th !py-2 hidden md:table-cell">By year</th>
                  <th className="table-th !py-2" style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <FragmentRow key={`${r.courseId}-${r.programCode ?? 'all'}`}
                    row={r}
                    expanded={expanded === r.courseId}
                    onToggle={() => setExpanded(prev => prev === r.courseId ? null : r.courseId)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-600 flex items-start gap-2">
            <Icon name="info" size={14} className="mt-0.5 flex-shrink-0 text-stone-400" />
            <span>Click any row to see which students requested the course and at what priority.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function FragmentRow({ row, expanded, onToggle }: { row: DemandRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="hover:bg-beige-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="table-td !py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-olive-600">{row.code}</span>
            <span className="text-stone-700 truncate">{row.title}</span>
            {row.programCode && <span className="badge badge-neutral text-[10px]">{row.programCode}</span>}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5 tabular">{row.units} units</div>
        </td>
        <td className="table-td !py-2 text-center tabular font-semibold text-olive-600">{row.demand}</td>
        <td className="table-td !py-2 text-center tabular hidden sm:table-cell">{row.highPriority}</td>
        <td className="table-td !py-2 hidden md:table-cell">
          <div className="flex items-center gap-1 flex-wrap">
            {row.byYearLevel.map(y => (
              <span key={y.yearLevel} className="text-[10px] bg-beige-100 text-stone-600 rounded px-1.5 py-0.5 tabular">
                Y{y.yearLevel}: {y.count}
              </span>
            ))}
          </div>
        </td>
        <td className="table-td !py-2 text-right">
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} className="text-stone-400" />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-beige-50/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">
              Interested students ({row.students.length})
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto scrollable">
              {row.students.map(s => (
                <li key={s.studentId} className="flex items-center gap-3 text-xs px-2 py-1 rounded hover:bg-white">
                  <span className="font-mono text-stone-500 truncate max-w-[140px]">{s.userCode ?? '—'}</span>
                  <span className="flex-1 text-stone-700 truncate">{s.studentName}</span>
                  {s.yearLevel != null && <span className="text-stone-400">Y{s.yearLevel}</span>}
                  <span className={`badge ${s.priority <= 2 ? 'badge-dropped' : s.priority >= 4 ? 'badge-neutral' : 'badge-faculty'}`}>P{s.priority}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
// TBA section auto-pass modal
// ============================================================================

function TbaAutoPassModal({ term, onClose, onDone }: {
  term: any; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const { data, isLoading } = useQuery<TbaAutoPassPreview>({
    queryKey: ['tba-auto-pass-preview', term.id],
    queryFn:  () => previewTbaAutoPass(term.id),
  });

  const mut = useMutation({
    mutationFn: () => autoPassTbaSections(term.id),
    onSuccess:  res => {
      toast.push({
        tone:    res.sectionsProcessed === 0 ? 'info' : 'success',
        title:   res.sectionsProcessed === 0
          ? 'Nothing to auto-pass'
          : `${res.studentsPromoted} student${res.studentsPromoted === 1 ? '' : 's'} promoted`,
        message: res.sectionsProcessed > 0
          ? `${res.sectionsProcessed} section${res.sectionsProcessed === 1 ? '' : 's'} closed at 1.00.`
          : undefined,
      });
      onDone();
    },
    onError: (e: unknown) => toast.push({
      tone: 'error', title: 'Auto-pass failed', message: parseApiError(e).message,
    }),
  });

  return (
    <Modal
      title={`Auto-pass TBA sections — ${term.name}`}
      subtitle="Sections that never had a faculty assigned. Confirming will give each enrolled student a 1.00 final grade and close the section."
      onClose={onClose}
      size="lg"
    >
      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : !data || data.sections.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon="check"
            title="Nothing to do"
            message="Every section in this term has a faculty assigned (or no enrolled students)."
          />
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card text-center !py-3">
              <div className="text-2xl font-display tabular font-medium text-amber-600">{data.summary.sectionsAffected}</div>
              <div className="text-xs text-stone-500 mt-1">TBA sections</div>
            </div>
            <div className="card text-center !py-3">
              <div className="text-2xl font-display tabular font-medium text-olive-500">{data.summary.studentsAffected}</div>
              <div className="text-xs text-stone-500 mt-1">Students → 1.00</div>
            </div>
          </div>

          <div className="border border-beige-200 rounded-lg max-h-72 overflow-y-auto scrollable">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-beige-50 z-10">
                <tr>
                  <th className="table-th !py-2">Section</th>
                  <th className="table-th !py-2">Course</th>
                  <th className="table-th !py-2 text-center" style={{ width: 80 }}>Students</th>
                </tr>
              </thead>
              <tbody>
                {data.sections.map(s => (
                  <tr key={s.section_id}>
                    <td className="table-td !py-1.5">
                      <span className="font-mono font-semibold text-olive-600">{s.section_code}</span>
                      <div className="text-[10px] text-stone-400">{s.block_label}</div>
                    </td>
                    <td className="table-td !py-1.5">
                      <span className="font-mono text-stone-500 mr-2">{s.course_code}</span>
                      <span className="text-stone-700">{s.course_title}</span>
                    </td>
                    <td className="table-td !py-1.5 text-center tabular font-semibold">{s.students}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
            <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">This action can't be undone from the UI.</div>
              Every still-enrolled student in the sections above will be marked <span className="font-mono font-semibold">1.00</span>, status <span className="font-mono font-semibold">completed</span>, with the reason audit-logged. A "Final grade posted" notification is sent to each student.
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
            >
              {mut.isPending
                ? <><span className="spinner" /> Processing…</>
                : <><Icon name="award" size={14} /> Auto-pass {data.summary.studentsAffected} student{data.summary.studentsAffected === 1 ? '' : 's'}</>}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
