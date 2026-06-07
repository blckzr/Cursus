import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, submitForgotPassword } from '../api';
import Icon from '../components/Icon';

export default function Login() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [forgot, setForgot]     = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await login(userCode, password);
      setAuth(data.user, data.token);
      const role: string = data.user.role;
      if (role === 'admin')        navigate('/admin');
      else if (role === 'faculty') navigate('/faculty');
      else                         navigate('/student');
    } catch {
      setError('Invalid user code or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-beige-200 grid lg:grid-cols-[1fr_minmax(400px,460px)]">
      {/* Left — brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-olive-600 text-white">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="dots" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-olive-400 flex items-center justify-center shadow-inset-tl">
              <span className="font-display font-bold text-2xl text-white leading-none">C</span>
            </div>
            <div>
              <div className="font-display font-semibold text-2xl leading-none">Cursus</div>
              <div className="text-olive-200 text-[11px] uppercase tracking-widest mt-1">Universidad Mariana · Manila</div>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-tight font-medium">
            A student record system that gets out of the way.
          </h2>
          <p className="text-olive-100 text-sm mt-5 leading-relaxed max-w-sm">
            For administrators, faculty, and students. Built to match the rhythm of a Philippine
            university — enrollments, grading periods, and the 1.00–5.00 scale.
          </p>
        </div>

        <div className="relative text-[11px] text-olive-200">
          AY 2025–2026 · 2nd Semester
        </div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-olive-400 rounded-xl mb-3 shadow">
              <span className="text-white text-xl font-bold font-display">C</span>
            </div>
            <h1 className="text-2xl font-semibold text-stone-800 font-display">Cursus</h1>
          </div>

          <h1 className="text-xl font-semibold text-stone-800">Welcome back</h1>
          <p className="text-sm text-stone-500 mt-1">Sign in with your university user code.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">User code</label>
              <input
                type="text"
                className="input font-mono tracking-wider"
                value={userCode}
                onChange={e => setUserCode(e.target.value.toUpperCase())}
                placeholder="2026-00001-MN-2"
                autoFocus
                required
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-[0.3rem]">
                <label className="label !mb-0">Password</label>
                <button
                  type="button"
                  onClick={() => setForgot(true)}
                  className="text-[11px] text-olive-600 hover:text-olive-700 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={revealed ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setRevealed(v => !v)}
                  aria-label={revealed ? 'Hide password' : 'Show password'}
                  title={revealed ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-stone-400 hover:text-olive-600 hover:bg-beige-100 transition-colors"
                >
                  <Icon name={revealed ? 'eye-off' : 'eye'} size={15} />
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full !py-2.5 flex items-center justify-center gap-2">
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="text-[11px] text-stone-400 mt-7 text-center">
            Need help? Contact the Registrar's Office · MN-2 Bldg, Rm 102
          </p>
        </div>
      </div>

      {forgot && <ForgotPasswordModal onClose={() => setForgot(false)} initialCode={userCode} />}
    </div>
  );
}

// ─── Forgot-password modal ─────────────────────────────────────────────────
function ForgotPasswordModal({ onClose, initialCode }: { onClose: () => void; initialCode: string }) {
  const [code, setCode]       = useState(initialCode);
  const [submitting, setSub]  = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setSub(true);
    try {
      await submitForgotPassword(code);
      setDone(true);
    } catch {
      // Backend always responds 200 — only network errors hit this branch.
      setError('We could not reach the server. Please try again.');
    } finally {
      setSub(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center px-4 modal-backdrop">
      <div className="card w-full max-w-md modal-card">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="page-title !text-xl">Forgot your password?</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              The registrar reviews each request manually.
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        {done ? (
          <div className="space-y-3 mt-4">
            <div className="bg-olive-50 dark:bg-olive-500/15 border border-olive-200 dark:border-olive-400/40 rounded-lg p-3 text-sm text-stone-700 dark:text-stone-200 flex items-start gap-2">
              <Icon name="check" size={14} className="mt-0.5 flex-shrink-0 text-olive-500 dark:text-olive-200" />
              <div>
                <div className="font-semibold">Request submitted.</div>
                <div className="text-xs mt-0.5">
                  If the user code you entered exists, an administrator has been notified. You'll
                  receive an in-app notification — or you can simply try signing in with the default
                  password — once it's approved.
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            <div>
              <label className="label">User code</label>
              <input
                className="input"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="2026-00001-MN-2"
                autoFocus
                required
              />
              <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
                The 9–14 character code printed on your ID, e.g. <span className="font-mono">2026-00001-MN-2</span>.
              </p>
            </div>

            {error && (
              <div className="text-red-700 dark:text-red-200 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-400/40 rounded-lg px-3 py-2 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="bg-beige-50 dark:bg-stone-800 border border-beige-200 dark:border-stone-700 rounded-lg p-3 text-[11px] text-stone-500 dark:text-stone-400 flex items-start gap-2">
              <Icon name="shield" size={12} className="mt-0.5 flex-shrink-0" />
              <span>For your safety we never confirm whether a user code exists. You'll see the same success message either way.</span>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting || !code.trim()}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
