import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCourses, createCourse, getPrograms, getSections } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/DataTable';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';

export default function Courses() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['courses'], queryFn: () => getCourses() });
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: getPrograms });
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', units: '3', programId: '' });
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [progFilter, setProgFilter] = useState('all');

  const createMut = useMutation({
    mutationFn: () => createCourse({ code: form.code, title: form.title, units: Number(form.units), programId: form.programId || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      setShowCreate(false); setForm({ code: '', title: '', units: '3', programId: '' }); setErr('');
      toast.push({ tone: 'success', title: 'Course added' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const sectionCountFor = (code: string) => sections.filter((s: any) => s.course_code === code).length;

  const filtered = useMemo(() => courses.filter((c: any) => {
    if (query && !`${c.code} ${c.title}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (progFilter === 'all') return true;
    if (progFilter === 'general') return !c.program_id;
    return c.program_id === progFilter;
  }), [courses, query, progFilter]);

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Courses"
        subtitle="Master list of courses offered."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); setErr(''); }}><Icon name="plus" size={14} /> New course</button>}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search code or title…" className="w-72" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip active={progFilter === 'all'} onClick={() => setProgFilter('all')}>All</Chip>
          <Chip active={progFilter === 'general'} onClick={() => setProgFilter('general')}>General Ed</Chip>
          {programs.map((p: any) => (
            <Chip key={p.id} active={progFilter === p.id} onClick={() => setProgFilter(p.id)}>{p.code}</Chip>
          ))}
        </div>
        <span className="text-xs text-stone-400 ml-auto tabular">{filtered.length} of {courses.length}</span>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="book-open" title="No courses match" message="Try a different filter or add a course." /></div>
      ) : (
        <DataTable headers={[
          { label: 'Code' }, { label: 'Title' },
          { label: 'Units', align: 'center', width: 80 },
          { label: 'Program' },
          { label: 'Sections', align: 'center', width: 100 },
        ]}>
          {filtered.map((c: any) => (
            <tr key={c.id} className="hover:bg-beige-50 transition-colors">
              <td className="table-td font-mono font-semibold text-olive-500">{c.code}</td>
              <td className="table-td">{c.title}</td>
              <td className="table-td text-center tabular">{c.units}</td>
              <td className="table-td text-stone-500 text-xs">
                {c.program_name ?? <span className="text-stone-300">General Ed</span>}
              </td>
              <td className="table-td text-center tabular">{sectionCountFor(c.code)}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {showCreate && (
        <Modal title="New course" onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CS101" />
              <div className="col-span-2">
                <InputField label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Introduction to Programming" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Units" type="number" min="1" max="6" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              <SelectField label="Program" value={form.programId} onChange={e => setForm(f => ({ ...f, programId: e.target.value }))}>
                <option value="">— General Ed —</option>
                {programs.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </SelectField>
            </div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.code || !form.title}>
                {createMut.isPending ? 'Creating…' : 'Create course'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
