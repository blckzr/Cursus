import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrograms, createProgram } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField } from '../../components/FormField';

export default function Programs() {
  const qc = useQueryClient();
  const { data: programs = [], isLoading } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', totalUnits: '' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createProgram({ ...form, totalUnits: Number(form.totalUnits) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['programs'] }); setShowCreate(false); setForm({ code: '', name: '', totalUnits: '' }); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  return (
    <div>
      <PageHeader title="Programs" subtitle="Degree programs offered" action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Program</button>} />
      <div className="card p-0 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
          : programs.length === 0 ? <EmptyState message="No programs yet." />
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Code</th>
                <th className="table-th">Name</th>
                <th className="table-th">Total Units</th>
              </tr></thead>
              <tbody>
                {programs.map((p: Record<string, string>) => (
                  <tr key={p.id} className="hover:bg-beige-50">
                    <td className="table-td font-mono font-medium text-olive-500">{p.code}</td>
                    <td className="table-td">{p.name}</td>
                    <td className="table-td">{p.total_units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Create Program" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="BSCS" />
            <InputField label="Program Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bachelor of Science in Computer Science" />
            <InputField label="Total Units" type="number" value={form.totalUnits} onChange={e => setForm(f => ({ ...f, totalUnits: e.target.value }))} placeholder="148" />
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
    </div>
  );
}
