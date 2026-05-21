import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEnrollments, createEnrollment, getSections, getUsers } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { SelectField } from '../../components/FormField';

export default function Enrollments() {
  const qc = useQueryClient();
  const { data: enrollments = [], isLoading } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });
  const { data: sections = [] }  = useQuery({ queryKey: ['sections'],         queryFn: () => getSections() });
  const { data: students = [] }  = useQuery({ queryKey: ['users', 'student'], queryFn: () => getUsers('student') });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ studentId: '', sectionId: '' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createEnrollment(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['enrollments'] }); setShowCreate(false); setForm({ studentId: '', sectionId: '' }); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const statusBadge = (s: string) => {
    if (s === 'enrolled')  return <span className="badge-enrolled">Enrolled</span>;
    if (s === 'dropped')   return <span className="badge-dropped">Dropped</span>;
    return <span className="badge-completed">Completed</span>;
  };

  return (
    <div>
      <PageHeader title="Enrollments" subtitle="Manage student section enrollments" action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ Enroll Student</button>} />
      <div className="card p-0 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
          : enrollments.length === 0 ? <EmptyState message="No enrollments yet." />
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Student</th>
                <th className="table-th">Section</th>
                <th className="table-th">Course</th>
                <th className="table-th">Term</th>
                <th className="table-th">Status</th>
                <th className="table-th">Final Grade</th>
              </tr></thead>
              <tbody>
                {enrollments.map((e: Record<string, string>) => (
                  <tr key={e.id} className="hover:bg-beige-50">
                    <td className="table-td font-medium">{e.student_name}</td>
                    <td className="table-td font-mono text-olive-500">{e.section_code}</td>
                    <td className="table-td">{e.course_title}</td>
                    <td className="table-td text-stone-500">{e.term_name}</td>
                    <td className="table-td">{statusBadge(e.status)}</td>
                    <td className="table-td">
                      {e.letter_grade
                        ? <span className="font-semibold text-olive-600">{e.letter_grade} ({Number(e.numeric_grade).toFixed(2)})</span>
                        : <span className="text-stone-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showCreate && (
        <Modal title="Enroll Student" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <SelectField label="Student" value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
              <option value="">Select student</option>
              {students.map((s: Record<string, string>) => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
            </SelectField>
            <SelectField label="Section" value={form.sectionId} onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))}>
              <option value="">Select section</option>
              {sections.map((s: Record<string, string>) => <option key={s.id} value={s.id}>{s.section_code} — {s.course_title} ({s.term_name})</option>)}
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Enrolling…' : 'Enroll'}
              </button>
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
