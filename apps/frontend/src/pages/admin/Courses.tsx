import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCourses, createCourse, getPrograms, getSections } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable, { type DataTableHeader } from '../../components/DataTable';
import TableSkeleton from '../../components/TableSkeleton';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';

const HEADERS: DataTableHeader[] = [
  { label: 'Code' }, { label: 'Title' },
  { label: 'Units', align: 'center', width: 70 },
  { label: 'Visibility' }, { label: 'Programs' },
  { label: 'Sections', align: 'center', width: 90 },
];

type Visibility = 'public' | 'restricted';
const EMPTY = { code: '', title: '', units: '3', visibility: 'public' as Visibility, programIds: [] as string[] };

export default function Courses() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['courses'], queryFn: () => getCourses() });
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: () => getPrograms() });
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const resetErr = () => { setErr(''); setFieldErrors({}); };
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | Visibility>('all');
  const [progFilter, setProgFilter] = useState('all');

  const createMut = useMutation({
    mutationFn: () => createCourse({
      code: form.code, title: form.title, units: Number(form.units),
      visibility: form.visibility,
      ...(form.visibility === 'restricted' ? { programIds: form.programIds } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      setShowCreate(false); setForm(EMPTY); resetErr();
      toast.push({ tone: 'success', title: 'Course added' });
    },
    onError: (e: unknown) => { const p = parseApiError(e, 'Failed to create course'); setErr(p.message); setFieldErrors(p.fields); },
  });

  const sectionCountFor = (code: string) => sections.filter((s: any) => s.course_code === code).length;

  const filtered = useMemo(() => courses.filter((c: any) => {
    if (visibilityFilter !== 'all' && c.visibility !== visibilityFilter) return false;
    if (progFilter !== 'all') {
      // Public courses match every program; restricted ones must include this program
      if (c.visibility === 'restricted' && !(c.programs || []).some((p: any) => p.id === progFilter)) return false;
    }
    if (query && !`${c.code} ${c.title}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [courses, query, progFilter, visibilityFilter]);

  const toggleProgramInForm = (id: string) => setForm(f => ({
    ...f,
    programIds: f.programIds.includes(id) ? f.programIds.filter(x => x !== id) : [...f.programIds, id],
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Courses"
        subtitle="Master list of courses. Public courses are available to every program; restricted ones are linked to specific programs."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); resetErr(); }}><Icon name="plus" size={14} /> New course</button>}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search code or title…" className="w-72" />
        <div className="flex items-center gap-1.5">
          <Chip active={visibilityFilter === 'all'}        onClick={() => setVisibilityFilter('all')}>All</Chip>
          <Chip active={visibilityFilter === 'public'}     onClick={() => setVisibilityFilter('public')}>Public</Chip>
          <Chip active={visibilityFilter === 'restricted'} onClick={() => setVisibilityFilter('restricted')}>Restricted</Chip>
        </div>
        <select className="input !w-auto" value={progFilter} onChange={e => setProgFilter(e.target.value)}>
          <option value="all">Any program</option>
          {programs.map((p: any) => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <span className="text-xs text-stone-400 ml-auto tabular">{filtered.length} of {courses.length}</span>
      </div>

      {isLoading ? (
        <TableSkeleton headers={HEADERS} rows={6} />
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="book-open" title="No courses match" message="Try a different filter or add a course." /></div>
      ) : (
        <DataTable headers={HEADERS}>
          {filtered.map((c: any) => (
            <tr key={c.id} className="hover:bg-beige-50 transition-colors">
              <td className="table-td font-mono font-semibold text-olive-500">{c.code}</td>
              <td className="table-td">{c.title}</td>
              <td className="table-td text-center tabular">{c.units}</td>
              <td className="table-td">
                {c.visibility === 'public'
                  ? <span className="badge badge-enrolled">Public</span>
                  : <span className="badge badge-faculty">Restricted</span>}
              </td>
              <td className="table-td">
                {c.visibility === 'public' ? (
                  <span className="text-xs text-stone-400 italic">All programs</span>
                ) : (c.programs || []).length === 0 ? (
                  <span className="text-stone-300">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(c.programs as { id: string; code: string }[]).map(p => (
                      <span key={p.id} className="font-mono text-[10px] bg-beige-100 text-olive-600 px-1.5 py-0.5 rounded font-semibold">{p.code}</span>
                    ))}
                  </div>
                )}
              </td>
              <td className="table-td text-center tabular">{sectionCountFor(c.code)}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {showCreate && (
        <Modal title="New course" onClose={() => { setShowCreate(false); resetErr(); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CS101" error={fieldErrors.code} />
              <div className="col-span-2">
                <InputField label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Introduction to Programming" error={fieldErrors.title} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Units" type="number" min="1" max="6" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} error={fieldErrors.units} />
              <SelectField label="Visibility" value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value as Visibility }))} error={fieldErrors.visibility}>
                <option value="public">Public (all programs)</option>
                <option value="restricted">Restricted (selected programs)</option>
              </SelectField>
            </div>

            {form.visibility === 'restricted' && (
              <div>
                <label className="label">Available to programs</label>
                <div className="space-y-1.5 border border-khaki-200 rounded-lg p-2.5 max-h-44 overflow-y-auto scrollable">
                  {programs.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-beige-50 cursor-pointer">
                      <input type="checkbox" checked={form.programIds.includes(p.id)} onChange={() => toggleProgramInForm(p.id)} />
                      <span className="font-mono text-xs font-semibold text-olive-600 w-12">{p.code}</span>
                      <span className="text-sm text-stone-700 truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
                {fieldErrors.programIds && <p className="text-xs text-red-600 mt-1">{fieldErrors.programIds}</p>}
              </div>
            )}

            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); createMut.mutate(); }}
                disabled={createMut.isPending || !form.code || !form.title || (form.visibility === 'restricted' && form.programIds.length === 0)}>
                {createMut.isPending ? 'Creating…' : 'Create course'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
