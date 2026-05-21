import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser } from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { InputField, SelectField } from '../../components/FormField';

export default function Users() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => getUsers() });

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser]     = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'student' });
  const [editForm, setEditForm] = useState({ fullName: '', isActive: 'true' });
  const [err, setErr] = useState('');

  const createMut = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); setForm({ email: '', password: '', fullName: '', role: 'student' }); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create user'),
  });

  const updateMut = useMutation({
    mutationFn: () => updateUser(editUser!.id, { fullName: editForm.fullName, isActive: editForm.isActive === 'true' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update user'),
  });

  const roleBadge = (role: string) => {
    if (role === 'admin')   return <span className="badge-admin">Admin</span>;
    if (role === 'faculty') return <span className="badge-faculty">Faculty</span>;
    return <span className="badge-student">Student</span>;
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage admin, faculty, and student accounts"
        action={<button className="btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>}
      />

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <EmptyState message="No users yet. Create the first one." />
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Name</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">Status</th>
              <th className="table-th">Actions</th>
            </tr></thead>
            <tbody>
              {users.map((u: Record<string, string>) => (
                <tr key={u.id} className="hover:bg-beige-50 transition-colors">
                  <td className="table-td font-medium">{u.full_name}</td>
                  <td className="table-td text-stone-500">{u.email}</td>
                  <td className="table-td">{roleBadge(u.role)}</td>
                  <td className="table-td">
                    <span className={u.is_active === 'true' || u.is_active === true ? 'badge-enrolled' : 'badge-dropped'}>
                      {u.is_active === 'true' || u.is_active === true ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-td">
                    <button className="text-olive-400 hover:text-olive-600 text-xs font-medium"
                      onClick={() => { setEditUser(u); setEditForm({ fullName: u.full_name, isActive: String(u.is_active) }); setErr(''); }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <Modal title="Create User" onClose={() => { setShowCreate(false); setErr(''); }}>
          <div className="space-y-4">
            <InputField label="Full Name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Juan dela Cruz" />
            <InputField label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="juan@sis.local" />
            <InputField label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
            <SelectField label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="admin">Admin</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create User'}
              </button>
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {editUser && (
        <Modal title="Edit User" onClose={() => { setEditUser(null); setErr(''); }}>
          <div className="space-y-4">
            <InputField label="Full Name" value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} />
            <SelectField label="Status" value={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.value }))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </SelectField>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
