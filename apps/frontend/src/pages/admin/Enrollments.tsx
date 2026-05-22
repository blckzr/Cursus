import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEnrollments, createEnrollment, updateEnrollment, getSections, getUsers } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/DataTable';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { SelectField } from '../../components/FormField';

export default function Enrollments() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: enrollments = [], isLoading } = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });
  const { data: sections = [] } = useQuery({ queryKey: ['sections'],         queryFn: () => getSections() });
  const { data: students = [] } = useQuery({ queryKey: ['users', 'student'], queryFn: () => getUsers('student') });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ studentId: '', sectionId: '' });
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [termFilter, setTermFilter] = useState('all');

  const createMut = useMutation({
    mutationFn: () => createEnrollment(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      setShowCreate(false); setForm({ studentId: '', sectionId: '' }); setErr('');
      toast.push({ tone: 'success', title: 'Student enrolled' });
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const dropMut = useMutation({
    mutationFn: (id: string) => updateEnrollment(id, { status: 'dropped' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      toast.push({ tone: 'info', title: 'Enrollment dropped' });
    },
    onError: (e: unknown) => toast.push({
      tone: 'error', title: 'Could not drop',
      message: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '',
    }),
  });

  const terms = useMemo(
    () => [...new Set(enrollments.map((e: any) => e.term_name).filter(Boolean))] as string[],
    [enrollments],
  );

  const counts = useMemo(() => ({
    all: enrollments.length,
    enrolled:  enrollments.filter((e: any) => e.status === 'enrolled').length,
    completed: enrollments.filter((e: any) => e.status === 'completed').length,
    dropped:   enrollments.filter((e: any) => e.status === 'dropped').length,
  }), [enrollments]);

  const filtered = useMemo(() => enrollments.filter((e: any) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (termFilter !== 'all' && e.term_name !== termFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${e.student_name} ${e.section_code} ${e.course_title}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [enrollments, statusFilter, termFilter, query]);

  const statusBadge = (s: string) =>
    s === 'completed' ? <span className="badge badge-completed">Completed</span>
    : s === 'dropped' ? <span className="badge badge-dropped">Dropped</span>
    : <span className="badge badge-enrolled">Enrolled</span>;

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Enrollments"
        subtitle="Student section enrollments across all terms."
        action={<button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); setErr(''); }}><Icon name="plus" size={14} /> Enroll student</button>}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search student, section, course…" className="w-72" />
        <div className="flex items-center gap-1.5">
          <Chip active={statusFilter === 'all'}       onClick={() => setStatusFilter('all')}>All ({counts.all})</Chip>
          <Chip active={statusFilter === 'enrolled'}  onClick={() => setStatusFilter('enrolled')}>Enrolled ({counts.enrolled})</Chip>
          <Chip active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')}>Completed ({counts.completed})</Chip>
          <Chip active={statusFilter === 'dropped'}   onClick={() => setStatusFilter('dropped')}>Dropped ({counts.dropped})</Chip>
        </div>
        <select className="input !w-auto" value={termFilter} onChange={e => setTermFilter(e.target.value)}>
          <option value="all">All terms</option>
          {terms.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-stone-400 ml-auto tabular">{filtered.length} of {enrollments.length}</span>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="clipboard-list" title="No enrollments match" message="Try a different filter or enroll a student." /></div>
      ) : (
        <DataTable headers={[
          { label: 'Student' }, { label: 'Section' }, { label: 'Course' }, { label: 'Term' },
          { label: 'Status' }, { label: 'Final grade', align: 'right' }, { label: '', align: 'right' },
        ]}>
          {filtered.slice(0, 100).map((e: any) => (
            <tr key={e.id} className="hover:bg-beige-50 transition-colors">
              <td className="table-td">
                <div className="flex items-center gap-2.5">
                  <Avatar name={e.student_name} size={26} tone="beige" />
                  <span className="font-medium text-stone-800">{e.student_name}</span>
                </div>
              </td>
              <td className="table-td font-mono text-olive-500 text-xs font-semibold">{e.section_code}</td>
              <td className="table-td">{e.course_title}</td>
              <td className="table-td text-stone-500 text-xs">{e.term_name}</td>
              <td className="table-td">{statusBadge(e.status)}</td>
              <td className="table-td text-right">
                {e.letter_grade
                  ? <span className="font-semibold text-olive-600 tabular">{e.letter_grade}
                      <span className="text-stone-400 text-[10px] ml-1">({Number(e.numeric_grade).toFixed(2)})</span>
                    </span>
                  : <span className="text-stone-300">—</span>}
              </td>
              <td className="table-td text-right">
                {e.status === 'enrolled' && (
                  <button className="btn-icon ml-auto hover:!text-red-500" title="Drop enrollment"
                    disabled={dropMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Drop ${e.student_name} from ${e.section_code}?`)) dropMut.mutate(e.id);
                    }}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {filtered.length > 100 && (
        <p className="text-xs text-stone-400 text-center mt-3">Showing 100 of {filtered.length} — refine your filters.</p>
      )}

      {showCreate && (
        <Modal title="Enroll student" subtitle="Add a student to a section." onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <SelectField label="Student" value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
              <option value="">Select student</option>
              {students.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.user_code ?? s.email})</option>)}
            </SelectField>
            <SelectField label="Section" value={form.sectionId} onChange={e => setForm(f => ({ ...f, sectionId: e.target.value }))}>
              <option value="">Select section</option>
              {sections.map((s: any) => <option key={s.id} value={s.id}>{s.section_code} — {s.course_title} ({s.term_name})</option>)}
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.studentId || !form.sectionId}>
                {createMut.isPending ? 'Enrolling…' : 'Enroll'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
