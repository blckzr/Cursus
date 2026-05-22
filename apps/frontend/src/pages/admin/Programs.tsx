import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrograms, createProgram } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField } from '../../components/FormField';

const EMPTY = { code: '', name: '', totalUnits: '', yearLevels: '4', blocksPerYear: '3', blockCapacity: '50' };

export default function Programs() {
  const qc = useQueryClient();
  const { data: programs = [], isLoading } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createProgram({
      code: form.code,
      name: form.name,
      totalUnits: Number(form.totalUnits),
      yearLevels: Number(form.yearLevels),
      blocksPerYear: Number(form.blocksPerYear),
      blockCapacity: Number(form.blockCapacity),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs'] });
      qc.invalidateQueries({ queryKey: ['blocks'] });
      setShowCreate(false);
      setForm(EMPTY);
      setErr('');
    },
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
                <th className="table-th">Year Levels</th>
                <th className="table-th">Blocks / Year</th>
                <th className="table-th">Block Capacity</th>
              </tr></thead>
              <tbody>
                {programs.map((p: Record<string, string>) => (
                  <tr key={p.id} className="hover:bg-beige-50">
                    <td className="table-td font-mono font-medium text-olive-500">{p.code}</td>
                    <td className="table-td">{p.name}</td>
                    <td className="table-td">{p.total_units}</td>
                    <td className="table-td">{p.year_levels}</td>
                    <td className="table-td">{p.blocks_per_year}</td>
                    <td className="table-td">{p.block_capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Create Program" onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BSCS" />
            <InputField label="Program Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bachelor of Science in Computer Science" />
            <InputField label="Total Units" type="number" value={form.totalUnits} onChange={e => setForm(f => ({ ...f, totalUnits: e.target.value }))} placeholder="148" />

            <div className="border-t border-beige-200 pt-3">
              <p className="text-xs font-semibold text-stone-500 mb-2">BLOCK CONFIGURATION</p>
              <div className="grid grid-cols-3 gap-3">
                <InputField label="Year Levels" type="number" value={form.yearLevels} onChange={e => setForm(f => ({ ...f, yearLevels: e.target.value }))} placeholder="4" />
                <InputField label="Blocks / Year" type="number" value={form.blocksPerYear} onChange={e => setForm(f => ({ ...f, blocksPerYear: e.target.value }))} placeholder="3" />
                <InputField label="Capacity" type="number" value={form.blockCapacity} onChange={e => setForm(f => ({ ...f, blockCapacity: e.target.value }))} placeholder="50" />
              </div>
              <p className="text-xs text-stone-400 mt-2">
                {Number(form.yearLevels || 0) * Number(form.blocksPerYear || 0)} blocks will be auto-generated
                (e.g. <span className="font-mono text-olive-500">{form.code || 'BSCS'} 1-1</span>).
              </p>
            </div>

            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create'}
              </button>
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
