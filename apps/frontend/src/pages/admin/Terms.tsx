import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTerms, createTerm, updateTerm, openTerm, getSections, getEnrollments, getPrograms, getBlocks } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import CardGridSkeleton from '../../components/CardGridSkeleton';
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
