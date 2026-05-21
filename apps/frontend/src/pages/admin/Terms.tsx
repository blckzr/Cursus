import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTerms, createTerm, updateTerm } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField, SelectField } from '../../components/FormField';

export default function Terms() {
  const qc = useQueryClient();
  const { data: terms = [], isLoading } = useQuery({ queryKey: ['terms'], queryFn: getTerms });
  const [showCreate, setShowCreate] = useState(false);
  const [editTerm, setEditTerm] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isActive: 'false' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createTerm({ ...form, isActive: form.isActive === 'true' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['terms'] }); setShowCreate(false); setForm({ name: '', startDate: '', endDate: '', isActive: 'false' }); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateTerm(editTerm!.id, { isActive: form.isActive === 'true' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['terms'] }); setEditTerm(null); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  return (
    <div>
      <PageHeader title="Terms" subtitle="Academic semesters" action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Term</button>} />
      <div className="card p-0 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
          : terms.length === 0 ? <EmptyState message="No terms yet." />
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Name</th>
                <th className="table-th">Start</th>
                <th className="table-th">End</th>
                <th className="table-th">Status</th>
                <th className="table-th">Actions</th>
              </tr></thead>
              <tbody>
                {terms.map((t: Record<string, string>) => (
                  <tr key={t.id} className="hover:bg-beige-50">
                    <td className="table-td font-medium">{t.name}</td>
                    <td className="table-td text-stone-500">{new Date(t.start_date).toLocaleDateString()}</td>
                    <td className="table-td text-stone-500">{new Date(t.end_date).toLocaleDateString()}</td>
                    <td className="table-td">
                      {t.is_active === true || t.is_active === 'true'
                        ? <span className="badge-enrolled">Active</span>
                        : <span className="badge-student">Inactive</span>}
                    </td>
                    <td className="table-td">
                      <button className="text-olive-400 hover:text-olive-600 text-xs font-medium"
                        onClick={() => { setEditTerm(t); setForm(f => ({ ...f, isActive: String(t.is_active) })); }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Create Term" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <InputField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="2026 - 1st Semester" />
            <InputField label="Start Date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            <InputField label="End Date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            <SelectField label="Active?" value={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.value }))}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create'}
              </button>
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {editTerm && (
        <Modal title={`Edit: ${editTerm.name}`} onClose={() => setEditTerm(null)}>
          <div className="space-y-4">
            <SelectField label="Active?" value={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.value }))}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>Save</button>
              <button className="btn-ghost" onClick={() => setEditTerm(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
