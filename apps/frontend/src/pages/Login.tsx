import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login } from '../api';
import Icon from '../components/Icon';

export default function Login() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

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
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
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
    </div>
  );
}
