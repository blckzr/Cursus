import { useState, useEffect, ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { updateMe, changePassword } from '../api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { useToast } from '../components/Toast';
import { InputField } from '../components/FormField';
import { parseApiError } from '../lib/apiError';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  faculty: 'Faculty',
  student: 'Student',
};
const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-admin',
  faculty: 'badge-faculty',
  student: 'badge-student',
};

/** A row in the read-only "your details" section. */
function InfoRow({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="text-xs uppercase tracking-wider text-stone-400 font-medium w-28 flex-shrink-0">{label}</dt>
      <dd className={`text-sm text-stone-700 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

export default function Account() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  // ── Profile form ──────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName ?? '',
    email:    user?.email    ?? '',
  });
  useEffect(() => {
    setProfileForm({ fullName: user?.fullName ?? '', email: user?.email ?? '' });
  }, [user?.fullName, user?.email]);

  const [profileErr, setProfileErr] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});

  const profileDirty =
    profileForm.fullName !== (user?.fullName ?? '') ||
    profileForm.email    !== (user?.email    ?? '');

  const profileMut = useMutation({
    mutationFn: () => updateMe({
      fullName: profileForm.fullName !== user?.fullName ? profileForm.fullName : undefined,
      email:    profileForm.email    !== user?.email    ? profileForm.email    : undefined,
    }),
    onSuccess: (updated: any) => {
      refreshUser(updated);
      setProfileErr(''); setProfileFieldErrors({});
      toast.push({ tone: 'success', title: 'Profile updated' });
    },
    onError: (e: unknown) => {
      const p = parseApiError(e, 'Failed to update profile');
      setProfileErr(p.message); setProfileFieldErrors(p.fields);
    },
  });

  // ── Password form ─────────────────────────────────────────────
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdErr, setPwdErr] = useState('');
  const [pwdFieldErrors, setPwdFieldErrors] = useState<Record<string, string>>({});

  const passwordsMatch = pwdForm.newPassword === pwdForm.confirmPassword;
  const pwdReady =
    pwdForm.currentPassword.length > 0 &&
    pwdForm.newPassword.length >= 8 &&
    passwordsMatch;

  const pwdMut = useMutation({
    mutationFn: () => changePassword(pwdForm.currentPassword, pwdForm.newPassword),
    onSuccess: () => {
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwdErr(''); setPwdFieldErrors({});
      toast.push({ tone: 'success', title: 'Password updated', message: 'Use your new password next time you sign in.' });
    },
    onError: (e: unknown) => {
      const p = parseApiError(e, 'Failed to change password');
      setPwdErr(p.message); setPwdFieldErrors(p.fields);
    },
  });

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader eyebrow="Settings" title="Account" subtitle="Manage your profile and password." />

      {/* Profile */}
      <div className="card">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Profile</h2>
            <p className="text-xs text-stone-500 mt-0.5">Your account details on file with the Registrar.</p>
          </div>
          {profileDirty && (
            <button
              onClick={() => { setProfileErr(''); setProfileFieldErrors({}); profileMut.mutate(); }}
              disabled={profileMut.isPending}
              className="btn-primary flex items-center gap-2 flex-shrink-0"
            >
              {profileMut.isPending ? <><span className="spinner" /> Saving…</> : <>Save changes</>}
            </button>
          )}
        </div>

        <dl className="bg-beige-50 rounded-lg p-3 mb-5">
          <InfoRow label="User code" mono>{user.userCode ?? '—'}</InfoRow>
          <InfoRow label="Role">
            <span className={`badge ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
          </InfoRow>
          <InfoRow label="Branch">{user.branch ?? 'MN'}</InfoRow>
          {user.role === 'student' && (
            <>
              <InfoRow label="Program">
                {user.programCode ? (
                  <><span className="font-mono font-semibold text-olive-600 mr-2">{user.programCode}</span>{user.programName}</>
                ) : '—'}
              </InfoRow>
              <InfoRow label="Year level">{user.yearLevel ?? '—'}</InfoRow>
              <InfoRow label="Block" mono>{user.blockLabel ?? '—'}</InfoRow>
            </>
          )}
        </dl>

        <div className="space-y-3">
          <InputField
            label="Full name"
            value={profileForm.fullName}
            onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
            error={profileFieldErrors.fullName}
          />
          <InputField
            label="Email"
            type="email"
            value={profileForm.email}
            onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
            error={profileFieldErrors.email}
          />
        </div>

        {profileErr && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
            <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" /> {profileErr}
          </p>
        )}
      </div>

      {/* Change password */}
      <div className="card">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Change password</h2>
            <p className="text-xs text-stone-500 mt-0.5">Verify your current password before setting a new one.</p>
          </div>
          {pwdReady && (
            <button
              onClick={() => { setPwdErr(''); setPwdFieldErrors({}); pwdMut.mutate(); }}
              disabled={pwdMut.isPending}
              className="btn-primary flex items-center gap-2 flex-shrink-0"
            >
              {pwdMut.isPending ? <><span className="spinner" /> Updating…</> : 'Update password'}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <InputField
            label="Current password"
            type="password"
            value={pwdForm.currentPassword}
            onChange={e => setPwdForm(f => ({ ...f, currentPassword: e.target.value }))}
            error={pwdFieldErrors.currentPassword}
            placeholder="••••••••"
          />
          <InputField
            label="New password"
            type="password"
            value={pwdForm.newPassword}
            onChange={e => setPwdForm(f => ({ ...f, newPassword: e.target.value }))}
            error={pwdFieldErrors.newPassword}
            hint="At least 8 characters."
            placeholder="••••••••"
          />
          <InputField
            label="Confirm new password"
            type="password"
            value={pwdForm.confirmPassword}
            onChange={e => setPwdForm(f => ({ ...f, confirmPassword: e.target.value }))}
            error={
              pwdForm.confirmPassword && !passwordsMatch
                ? "Doesn't match the new password."
                : undefined
            }
            placeholder="••••••••"
          />
        </div>

        {pwdErr && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
            <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" /> {pwdErr}
          </p>
        )}
      </div>
    </div>
  );
}
