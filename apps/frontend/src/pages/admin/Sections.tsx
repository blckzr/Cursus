import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSections, createSection, getCourses, getTerms, getUsers, getEnrollments } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/DataTable';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';

const EMPTY = { courseId: '', termId: '', facultyId: '', sectionCode: '', dayOfWeek: '', startTime: '', endTime: '', room: '', capacity: '' };

export default function Sections() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: sections = [], isLoading } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });
  const { data: courses = [] }     = useQuery({ queryKey: ['courses'],     queryFn: () => getCourses() });
  const { data: terms = [] }       = useQuery({ queryKey: ['terms'],       queryFn: getTerms });
  const { data: faculty = [] }     = useQuery({ queryKey: ['users', 'faculty'], queryFn: () => getUsers('faculty') });
  const { data: enrollments = [] } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [termFilter, setTermFilter] = useState('all');

  const createMut = useMutation({
    mutationFn: () => createSection({ ...form, capacity: Number(form.capacity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections'] });
      setShowCreate(false); setForm(EMPTY); setErr('');
      toast.push({ tone: 'success', title: 'Section created' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const enrolledFor = (sectionId: string) =>
    enrollments.filter((e: any) => e.section_id === sectionId && e.status === 'enrolled').length;

  const filtered = useMemo(() => sections.filter((s: any) => {
    if (termFilter !== 'all' && s.term_name !== termFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${s.section_code} ${s.course_code} ${s.course_title}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [sections, termFilter, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Sections"
        subtitle="Class sections — schedule, room, and assigned faculty."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); setErr(''); }}><Icon name="plus" size={14} /> New section</button>}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search section or course…" className="w-72" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip active={termFilter === 'all'} onClick={() => setTermFilter('all')}>All terms</Chip>
          {terms.map((t: any) => (
            <Chip key={t.id} active={termFilter === t.name} onClick={() => setTermFilter(t.name)}>{t.name}</Chip>
          ))}
        </div>
        <span className="text-xs text-stone-400 ml-auto tabular">{filtered.length} sections</span>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="school" title="No sections match" message="Try a different filter or add a section." /></div>
      ) : (
        <DataTable headers={[
          { label: 'Section' }, { label: 'Course' }, { label: 'Term' }, { label: 'Faculty' },
          { label: 'Schedule' }, { label: 'Room' }, { label: 'Enrolled', align: 'center' },
        ]}>
          {filtered.map((s: any) => {
            const enrolled = enrolledFor(s.id);
            const fillPct = s.capacity ? (enrolled / s.capacity) * 100 : 0;
            return (
              <tr key={s.id} className="hover:bg-beige-50 transition-colors">
                <td className="table-td font-mono text-olive-500 font-semibold text-xs">{s.section_code}</td>
                <td className="table-td">
                  <span className="font-mono text-xs text-stone-500 font-semibold">{s.course_code}</span>
                  <span className="ml-2">{s.course_title}</span>
                </td>
                <td className="table-td text-stone-500 text-xs">{s.term_name}</td>
                <td className="table-td text-stone-500 text-xs">{s.faculty_name}</td>
                <td className="table-td text-xs">
                  {s.day_of_week
                    ? <><span className="font-mono">{s.day_of_week}</span> {s.start_time}–{s.end_time}</>
                    : <span className="text-stone-300">—</span>}
                </td>
                <td className="table-td text-stone-500 text-xs">{s.room ?? '—'}</td>
                <td className="table-td">
                  <div className="flex items-center gap-2 justify-center">
                    <span className="tabular text-xs font-semibold text-stone-700 w-12 text-right">{enrolled}/{s.capacity}</span>
                    <div className="w-20 h-1.5 bg-beige-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${fillPct >= 90 ? 'bg-red-400' : fillPct >= 70 ? 'bg-khaki-400' : 'bg-olive-300'}`}
                        style={{ width: `${Math.min(100, fillPct)}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {showCreate && (
        <Modal title="New section" onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-3">
            <SelectField label="Course" value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}>
              <option value="">Select course</option>
              {courses.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Term" value={form.termId} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}>
                <option value="">Select term</option>
                {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
              <SelectField label="Faculty" value={form.facultyId} onChange={e => setForm(f => ({ ...f, facultyId: e.target.value }))}>
                <option value="">Select faculty</option>
                {faculty.map((f: any) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </SelectField>
            </div>
            <InputField label="Section code" value={form.sectionCode} onChange={e => setForm(f => ({ ...f, sectionCode: e.target.value }))} placeholder="CS101-A" />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Day of week" value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))} placeholder="MWF" />
              <InputField label="Room" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="Room 201" />
              <InputField label="Start time" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              <InputField label="End time" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <InputField label="Capacity" type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="40" />
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create section'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
