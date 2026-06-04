import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, getPrograms } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable, { type DataTableHeader } from '../../components/DataTable';
import TableSkeleton from '../../components/TableSkeleton';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';
import BulkUserImportModal from './BulkUserImportModal';

const isActiveVal = (v: unknown) => v === true || v === 'true';

// Mobile keeps User code, Name, Role, Action.
// Email, Program, Block, Status collapse below sm and live in the edit modal anyway.
const HEADERS: DataTableHeader[] = [
  { label: 'User code' },
  { label: 'Name' },
  { label: 'Email',   hideBelow: 'md' },
  { label: 'Role' },
  { label: 'Program', hideBelow: 'md' },
  { label: 'Block',   hideBelow: 'lg' },
  { label: 'Status',  hideBelow: 'sm' },
  { label: '', align: 'right' },
];

export default function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => getUsers() });
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: () => getPrograms() });

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editUser, setEditUser]     = useState<Record<string, string> | null>(null);
  // Password isn't on the create form — the backend assigns the default
  // (1.PolytechnicU) and the user changes it on first login.
  const [form, setForm]     = useState({ email: '', fullName: '', role: 'student', branch: '', programId: '' });
  const [editForm, setEditForm] = useState({ fullName: '', isActive: 'true', branch: '', programId: '' });
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const resetErr = () => { setErr(''); setFieldErrors({}); };

  const createMut = useMutation({
    mutationFn: () => createUser({
      ...form,
      branch: form.branch || undefined,
      programId: form.role === 'student' ? form.programId : undefined,
    }),
    onSuccess: (u: any) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setForm({ email: '', fullName: '', role: 'student', branch: '', programId: '' });
      resetErr();
      toast.push({ tone: 'success', title: 'User created', message: u?.user_code });
    },
    onError: (e: unknown) => {
      const parsed = parseApiError(e, 'Failed to create user');
      setErr(parsed.message); setFieldErrors(parsed.fields);
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updateUser(editUser!.id, {
      fullName: editForm.fullName,
      isActive: editForm.isActive === 'true',
      branch:   editForm.branch || undefined,
      programId: editUser!.role === 'student' ? (editForm.programId || undefined) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null); resetErr();
      toast.push({ tone: 'success', title: 'Changes saved' });
    },
    onError: (e: unknown) => {
      const parsed = parseApiError(e, 'Failed to update user');
      setErr(parsed.message); setFieldErrors(parsed.fields);
    },
  });

  const counts = useMemo(() => ({
    all: users.length,
    student: users.filter((u: any) => u.role === 'student').length,
    faculty: users.filter((u: any) => u.role === 'faculty').length,
    admin:   users.filter((u: any) => u.role === 'admin').length,
  }), [users]);

  const isGraduated = (u: any) => u.graduated_at != null;
  const filtered = useMemo(() => users.filter((u: any) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active'    && !isActiveVal(u.is_active)) return false;
    if (statusFilter === 'graduated' && !isGraduated(u))           return false;
    if (statusFilter === 'inactive'  && (isActiveVal(u.is_active) || isGraduated(u))) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![u.full_name, u.email, u.user_code].some((v: string) => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [users, roleFilter, statusFilter, query]);

  const roleBadge = (role: string) =>
    role === 'admin' ? <span className="badge badge-admin">Admin</span>
    : role === 'faculty' ? <span className="badge badge-faculty">Faculty</span>
    : <span className="badge badge-student">Student</span>;

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Users"
        subtitle="Manage admin, faculty, and student accounts."
        action={
          <>
            <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={() => setShowImport(true)}>
              <Icon name="upload" size={14} />
              <span className="hidden sm:inline">Import CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={() => { setShowCreate(true); resetErr(); }}>
              <Icon name="plus" size={14} /> New user
            </button>
          </>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4 md:flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or user code…" className="w-full md:w-80" />
        <div className="-mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto scrollable">
          <div className="flex items-center gap-1.5 w-max md:w-auto">
            <Chip active={roleFilter === 'all'}     onClick={() => setRoleFilter('all')}>All ({counts.all})</Chip>
            <Chip active={roleFilter === 'student'} onClick={() => setRoleFilter('student')}>Students ({counts.student})</Chip>
            <Chip active={roleFilter === 'faculty'} onClick={() => setRoleFilter('faculty')}>Faculty ({counts.faculty})</Chip>
            <Chip active={roleFilter === 'admin'}   onClick={() => setRoleFilter('admin')}>Admin ({counts.admin})</Chip>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <select className="input w-full md:!w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="graduated">Graduated</option>
          </select>
          <span className="text-xs text-stone-400 md:ml-auto tabular whitespace-nowrap">{filtered.length} of {users.length}</span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton headers={HEADERS} rows={6} />
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="users" title="No users match" message="Try a different filter or clear the search." /></div>
      ) : (
        <DataTable headers={HEADERS} pageSize={10}>
          {filtered.map((u: any) => (
            <tr key={u.id} className="hover:bg-beige-50 transition-colors">
              <td className="table-td">
                <span className="font-mono text-xs bg-beige-100 text-olive-600 px-2 py-1 rounded font-semibold tracking-wide">{u.user_code ?? '—'}</span>
              </td>
              <td className="table-td">
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.full_name} size={28} tone="beige" />
                  <span className="font-medium text-stone-800">{u.full_name}</span>
                </div>
              </td>
              <td className="table-td text-stone-500 text-xs hidden md:table-cell">{u.email}</td>
              <td className="table-td">{roleBadge(u.role)}</td>
              <td className="table-td hidden md:table-cell">
                {u.program_code
                  ? <span className="font-mono text-xs bg-beige-100 text-olive-600 px-2 py-0.5 rounded font-semibold">{u.program_code}</span>
                  : <span className="text-stone-300">—</span>}
              </td>
              <td className="table-td hidden lg:table-cell">
                {u.block_label
                  ? <span className="font-mono text-xs text-stone-600">{u.block_label}</span>
                  : <span className="text-stone-300">—</span>}
              </td>
              <td className="table-td hidden sm:table-cell">
                {isGraduated(u) ? (
                  <span className="badge badge-completed"
                    title={`Graduated ${new Date(u.graduated_at).toLocaleDateString()}`}>
                    <Icon name="award" size={10} /> Graduated
                  </span>
                ) : isActiveVal(u.is_active) ? (
                  <span className="badge badge-enrolled">Active</span>
                ) : (
                  <span className="badge badge-dropped">Inactive</span>
                )}
              </td>
              <td className="table-td text-right">
                <button className="btn-icon ml-auto" title="Edit" onClick={() => {
                  setEditUser(u);
                  setEditForm({ fullName: u.full_name, isActive: String(u.is_active), branch: u.branch ?? 'MN', programId: u.program_id ?? '' });
                  resetErr();
                }}><Icon name="pencil" size={13} /></button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* Create modal */}
      {showImport && (
        <BulkUserImportModal onClose={() => setShowImport(false)} />
      )}

      {showCreate && (
        <Modal title="New user" subtitle="A user code is generated from year, branch, and role." onClose={() => { setShowCreate(false); resetErr(); }}>
          <div className="space-y-4">
            <InputField label="Full name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="Juan Miguel dela Cruz" error={fieldErrors.fullName} autoFocus />
            <InputField label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="juan@sis.local" error={fieldErrors.email} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} error={fieldErrors.role}>
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Administrator</option>
              </SelectField>
              <InputField label="Branch code" value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value.toUpperCase() }))}
                placeholder="MN (default)" maxLength={10} error={fieldErrors.branch} />
            </div>
            {form.role === 'student' && (
              <SelectField label="Program" value={form.programId} onChange={e => setForm(f => ({ ...f, programId: e.target.value }))}
                error={fieldErrors.programId}>
                <option value="">— Select a program —</option>
                {programs.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </SelectField>
            )}
            <div className="bg-beige-100 rounded-lg px-3 py-2.5 text-xs text-stone-600 space-y-1.5">
              <div className="flex items-start gap-2">
                <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
                <span>User code preview: <span className="font-mono text-olive-600 font-semibold">{new Date().getFullYear()}-NNNNN-{form.branch || 'MN'}-{form.role === 'student' ? '0' : form.role === 'faculty' ? '1' : '2'}</span></span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="shield" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
                <span>Default password: <span className="font-mono text-olive-600 font-semibold">1.PolytechnicU</span> — share it with the user out-of-band; they'll be asked to change it on first login.</span>
              </div>
            </div>
            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setShowCreate(false); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); createMut.mutate(); }}
                disabled={createMut.isPending || (form.role === 'student' && !form.programId)}>
                {createMut.isPending ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.user_code ?? editUser.full_name}`} onClose={() => { setEditUser(null); resetErr(); }}>
          <div className="space-y-4">
            <InputField label="Full name" value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
              error={fieldErrors.fullName} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Status" value={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.value }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </SelectField>
              <InputField label="Branch code" value={editForm.branch}
                onChange={e => setEditForm(f => ({ ...f, branch: e.target.value.toUpperCase() }))}
                maxLength={10} error={fieldErrors.branch} />
            </div>
            {editUser.role === 'student' && (
              <SelectField label="Program" value={editForm.programId} onChange={e => setEditForm(f => ({ ...f, programId: e.target.value }))}
                error={fieldErrors.programId}>
                <option value="">— Select a program —</option>
                {programs.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </SelectField>
            )}
            <p className="text-xs text-stone-400">Branch change only affects future display, not the existing user code.</p>
            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditUser(null); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); updateMut.mutate(); }} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
