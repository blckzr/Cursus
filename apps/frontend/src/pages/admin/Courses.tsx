import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCourses, createCourse, getPrograms } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField, SelectField } from '../../components/FormField';

export default function Courses() {
  const qc = useQueryClient();
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['courses'], queryFn: () => getCourses() });
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', units: '', programId: '' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createCourse({ ...form, units: Number(form.units), programId: form.programId || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); setShowCreate(false); setForm({ code: '', title: '', units: '', programId: '' }); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  return (
    <div>
      <PageHeader title="Courses" subtitle="Course catalog" action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Course</button>} />
      <div className="card p-0 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
          : courses.length === 0 ? <EmptyState message="No courses yet." />
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Code</th>
                <th className="table-th">Title</th>
                <th className="table-th">Units</th>
                <th className="table-th">Program</th>
              </tr></thead>
              <tbody>
                {courses.map((c: Record<string, string>) => (
                  <tr key={c.id} className="hover:bg-beige-50">
                    <td className="table-td font-mono font-medium text-olive-500">{c.code}</td>
                    <td className="table-td">{c.title}</td>
                    <td className="table-td">{c.units}</td>
                    <td className="table-td text-stone-500">{c.program_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Create Course" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="CS101" />
            <InputField label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Introduction to Programming" />
            <InputField label="Units" type="number" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} placeholder="3" />
            <SelectField label="Program (optional)" value={form.programId} onChange={e => setForm(f => ({ ...f, programId: e.target.value }))}>
              <option value="">— None —</option>
              {programs.map((p: Record<string, string>) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
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
    </div>
  );
}
