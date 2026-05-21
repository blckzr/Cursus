import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface NavItem { label: string; to: string; icon: string; }

interface Props { navItems: NavItem[]; roleLabel: string; }

export default function AppLayout({ navItems, roleLabel }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden bg-beige-200">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-olive-600 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-olive-500">
          <h1 className="text-white font-bold text-lg tracking-tight">SIS</h1>
          <p className="text-olive-200 text-xs mt-0.5">Student Information System</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length === 2}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-olive-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-olive-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-khaki-300 flex items-center justify-center text-sm font-semibold text-stone-700">
              {user?.fullName?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-xs font-medium truncate">{user?.fullName}</p>
              <p className="text-olive-200 text-xs capitalize">{roleLabel}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-left text-xs text-olive-200 hover:text-white transition-colors py-1">
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
