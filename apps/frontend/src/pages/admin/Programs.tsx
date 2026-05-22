import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrograms, createProgram } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField } from '../../components/FormField';

const EMPTY = { code: '', name: '', totalUnits: '', yearLevels: '4', blocksPerYear: '3', blockCapacity: '50' };

export default function Programs() {
  const qc = useQueryClient();
  const toast = useToast();
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
      setShowCreate(false); setForm(EMPTY); setErr('');
      toast.push({ tone: 'success', title: 'Program added' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Programs"
        subtitle="Degree programs offered by the university."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); setErr(''); }}><Icon name="plus" size={14} /> New program</button>}
      />

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : programs.length === 0 ? (
        <div className="card p-0"><EmptyState icon="graduation-cap" title="No programs yet" message="Create the first degree program." /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {programs.map((p: any) => (
            <div key={p.id} className="card hover:border-olive-200 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs font-semibold text-olive-500">{p.code}</div>
                  <h3 className="font-medium text-stone-800 mt-1 text-sm leading-tight">{p.name}</h3>
                </div>
                <Icon name="graduation-cap" size={18} className="text-khaki-300" />
              </div>
              <div className="mt-4 pt-3 border-t border-beige-200 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-base font-semibold tabular">{p.total_units}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">Units</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular">{p.year_levels}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">Years</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular">{Number(p.year_levels) * Number(p.blocks_per_year)}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">Blocks</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New program" subtitle="Block sections are generated automatically from the configuration." onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BSCS" />
              <div className="col-span-2">
                <InputField label="Program name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bachelor of Science in Computer Science" />
              </div>
            </div>
            <InputField label="Total units" type="number" value={form.totalUnits} onChange={e => setForm(f => ({ ...f, totalUnits: e.target.value }))} placeholder="150" />

            <div className="border-t border-beige-200 pt-3">
              <p className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Block configuration</p>
              <div className="grid grid-cols-3 gap-3">
                <InputField label="Year levels" type="number" value={form.yearLevels} onChange={e => setForm(f => ({ ...f, yearLevels: e.target.value }))} />
                <InputField label="Blocks / year" type="number" value={form.blocksPerYear} onChange={e => setForm(f => ({ ...f, blocksPerYear: e.target.value }))} />
                <InputField label="Capacity" type="number" value={form.blockCapacity} onChange={e => setForm(f => ({ ...f, blockCapacity: e.target.value }))} />
              </div>
              <p className="text-xs text-stone-400 mt-2">
                {Number(form.yearLevels || 0) * Number(form.blocksPerYear || 0)} blocks will be generated — e.g.{' '}
                <span className="font-mono text-olive-500">{form.code || 'BSCS'} 1-1</span>.
              </p>
            </div>

            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !form.code || !form.name || !form.totalUnits}>
                {createMut.isPending ? 'Creating…' : 'Create program'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
