import { createContext, useContext, useState, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'faculty' | 'student';
  /** Layered over `role`: 'alumni' when a student has graduated. */
  effectiveRole?: 'admin' | 'faculty' | 'student' | 'alumni';
  /** ISO timestamp. Set for alumni; null for active students. */
  graduatedAt?: string | null;
  userCode?: string;
  branch?: string;
  programId?: string | null;
  programCode?: string | null;
  programName?: string | null;
  yearLevel?: number | null;
  blockLabel?: string | null;
  /**
   * When TRUE, the app blocks every authenticated route and forces the user
   * onto the change-password screen. Set on account creation and on admin
   * password reset; cleared by /auth/change-password.
   */
  passwordMustChange?: boolean;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  /** Refresh just the user object (keep the existing token). Used after profile edits. */
  refreshUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('sis_user') ?? 'null'); } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sis_token'));

  const setAuth = (u: User, t: string) => {
    setUser(u); setToken(t);
    localStorage.setItem('sis_user', JSON.stringify(u));
    localStorage.setItem('sis_token', t);
  };

  const refreshUser = (u: User) => {
    setUser(u);
    localStorage.setItem('sis_user', JSON.stringify(u));
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('sis_user');
    localStorage.removeItem('sis_token');
  };

  return <AuthContext.Provider value={{ user, token, setAuth, refreshUser, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
