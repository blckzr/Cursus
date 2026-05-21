import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSections, createSection, getCourses, getTerms, getUsers } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField, SelectField } from '../../components/FormField';

export default function Sections() {
  const qc = useQueryClient();
  const { data: sections = [], isLoading } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });
  const { data: courses = [] }  = useQuery({ queryKey: ['courses'],  queryFn: () => getCourses() });
  const { data: terms = [] }    = useQuery({ queryKey: ['terms'],    queryFn: getTerms });
  const { data: faculty = [] }  = useQuery({ queryKey: ['users', 'faculty'], queryFn: () => getUsers('faculty') });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ courseId: '', termId: '', facultyId: '', sectionCode: '', dayOfWeek: '', startTime: '', endTime: '', room: '', capacity: '' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createSection({ ...form, capacity: Number(form.capacity) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sections'] }); setShowCreate(false); setForm({ courseId: '', termId: '', facultyId: '', sectionCode: '', dayOfWeek: '', startTime: '', endTime: '', room: '', capacity: '' }); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  return (
    <div>
      <PageHeader title="Sections" subtitle="Course sections per term" action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Section</button>} />
      <div className="card p-0 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
          : sections.length === 0 ? <EmptyState message="No sections yet." />
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Section</th>
                <th className="table-th">Course</th>
                <th className="table-th">Term</th>
                <th className="table-th">Faculty</th>
                <th className="table-th">Schedule</th>
                <th className="table-th">Capacity</th>
              </tr></thead>
              <tbody>
                {sections.map((s: Record<string, string>) => (
                  <tr key={s.id} className="hover:bg-beige-50">
                    <td className="table-td font-mono font-medium text-olive-500">{s.section_code}</td>
                    <td className="table-td">{s.course_code} — {s.course_title}</td>
                    <td className="table-td text-stone-500">{s.term_name}</td>
                    <td className="table-td">{s.faculty_name}</td>
                    <td className="table-td text-stone-500">{s.day_of_week ? `${s.day_of_week} ${s.start_time}–${s.end_time}` : '—'}</td>
                    <td className="table-td">{s.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Create Section" onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <SelectField label="Course" value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}>
              <option value="">Select course</option>
              {courses.map((c: Record<string, string>) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </SelectField>
            <SelectField label="Term" value={form.termId} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}>
              <option value="">Select term</option>
              {terms.map((t: Record<string, string>) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <SelectField label="Faculty" value={form.facultyId} onChange={e => setForm(f => ({ ...f, facultyId: e.target.value }))}>
              <option value="">Select faculty</option>
              {faculty.map((f: Record<string, string>) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </SelectField>
            <InputField label="Section Code" value={form.sectionCode} onChange={e => setForm(f => ({ ...f, sectionCode: e.target.value }))} placeholder="CS101-A" />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Day of Week" value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))} placeholder="MWF" />
              <InputField label="Room" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="Room 201" />
              <InputField label="Start Time" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              <InputField label="End Time" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <InputField label="Capacity" type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="40" />
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
