import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrograms, createProgram } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import CardGridSkeleton from '../../components/CardGridSkeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';

// total_units is no longer in the form — it's computed live by the API
// from the program's curriculum entries (sum of placed course units).
const EMPTY = { code: '', name: '', yearLevels: '4', blocksPerYear: '3', blockCapacity: '50' };

export default function Programs() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: programs = [], isLoading } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const resetErr = () => { setErr(''); setFieldErrors({}); };

  const createMut = useMutation({
    mutationFn: () => createProgram({
      code: form.code,
      name: form.name,
      yearLevels: Number(form.yearLevels),
      blocksPerYear: Number(form.blocksPerYear),
      blockCapacity: Number(form.blockCapacity),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs'] });
      qc.invalidateQueries({ queryKey: ['blocks'] });
      setShowCreate(false); setForm(EMPTY); resetErr();
      toast.push({ tone: 'success', title: 'Program added' });
    },
    onError: (e: unknown) => { const p = parseApiError(e, 'Failed to create program'); setErr(p.message); setFieldErrors(p.fields); },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Programs"
        subtitle="Degree programs offered by the university."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); resetErr(); }}><Icon name="plus" size={14} /> New program</button>}
      />

      {isLoading ? (
        <CardGridSkeleton count={6} cols={3} />
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
                <div><div className="text-base font-semibold tabular">{p.total_units}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Units</div></div>
                <div><div className="text-base font-semibold tabular">{p.year_levels}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Years</div></div>
                <div><div className="text-base font-semibold tabular">{Number(p.year_levels) * Number(p.blocks_per_year)}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Blocks</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New program" subtitle="Block sections are generated automatically from the configuration." onClose={() => { setShowCreate(false); resetErr(); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BSCS" error={fieldErrors.code} />
              <div className="sm:col-span-2">
                <InputField label="Program name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bachelor of Science in Computer Science" error={fieldErrors.name} />
              </div>
            </div>
            <div className="bg-beige-100 rounded-lg px-3 py-2.5 text-xs text-stone-600 flex items-start gap-2">
              <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
              <span>
                Total program units are computed automatically from the
                curriculum — add courses on the <span className="font-medium text-stone-700">Curriculum builder</span> page after creating this program.
              </span>
            </div>

            <div className="border-t border-beige-200 pt-3">
              <p className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Block configuration</p>
              <div className="grid grid-cols-3 gap-3">
                <InputField label="Year levels" type="number" value={form.yearLevels} onChange={e => setForm(f => ({ ...f, yearLevels: e.target.value }))} error={fieldErrors.yearLevels} />
                <InputField label="Blocks / year" type="number" value={form.blocksPerYear} onChange={e => setForm(f => ({ ...f, blocksPerYear: e.target.value }))} error={fieldErrors.blocksPerYear} />
                <InputField label="Capacity" type="number" value={form.blockCapacity} onChange={e => setForm(f => ({ ...f, blockCapacity: e.target.value }))} error={fieldErrors.blockCapacity} />
              </div>
              <p className="text-xs text-stone-400 mt-2">
                {Number(form.yearLevels || 0) * Number(form.blocksPerYear || 0)} blocks will be generated — e.g.{' '}
                <span className="font-mono text-olive-500">{form.code || 'BSCS'} 1-1</span>.
              </p>
            </div>

            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); createMut.mutate(); }}
                disabled={createMut.isPending || !form.code || !form.name}>
                {createMut.isPending ? 'Creating…' : 'Create program'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
