import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTerms, createTerm, updateTerm, getSections, getEnrollments } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';

const isActive = (v: unknown) => v === true || v === 'true';
const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function Terms() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: terms = [], isLoading } = useQuery({ queryKey: ['terms'], queryFn: getTerms });
  const { data: sections = [] }    = useQuery({ queryKey: ['sections'],    queryFn: () => getSections() });
  const { data: enrollments = [] } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });

  const [showCreate, setShowCreate] = useState(false);
  const [editTerm, setEditTerm] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isActive: 'false' });
  const [editActive, setEditActive] = useState('false');
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createTerm({ ...form, isActive: form.isActive === 'true' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] });
      setShowCreate(false); setForm({ name: '', startDate: '', endDate: '', isActive: 'false' }); setErr('');
      toast.push({ tone: 'success', title: 'Term created' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateTerm(editTerm!.id, { isActive: editActive === 'true' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] });
      setEditTerm(null); setErr('');
      toast.push({ tone: 'success', title: 'Term updated' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
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
        subtitle="Manage academic terms and the active period."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); setErr(''); }}><Icon name="plus" size={14} /> New term</button>}
      />

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
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
                      {active ? 'Active term' : 'Past term'}
                    </div>
                    <h3 className="font-medium text-stone-800 mt-0.5">{t.name}</h3>
                    <p className="text-xs text-stone-500 mt-1.5">
                      {new Date(t.start_date).toLocaleDateString()} → {new Date(t.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {active && <span className="badge badge-completed">Current</span>}
                    <button className="btn-icon" title="Edit"
                      onClick={() => { setEditTerm(t); setEditActive(String(t.is_active)); setErr(''); }}>
                      <Icon name="pencil" size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-beige-200 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-base font-semibold tabular">{st.secs}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Sections</div></div>
                  <div><div className="text-base font-semibold tabular">{st.enr}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Enrollments</div></div>
                  <div><div className="text-base font-semibold tabular">{st.weeks}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Weeks</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="New term" onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <InputField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="AY 2025–2026, 2nd Semester" />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Start date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              <InputField label="End date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <SelectField label="Active?" value={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.value }))}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create term'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editTerm && (
        <Modal title={`Edit — ${editTerm.name}`} onClose={() => { setEditTerm(null); setErr(''); }}>
          <div className="space-y-4">
            <SelectField label="Active?" value={editActive} onChange={e => setEditActive(e.target.value)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditTerm(null); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
