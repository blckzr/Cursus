import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { type LucideIcon, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface Props {
  navItems: NavItem[];
  roleLabel: string;
}

export default function AppLayout({ navItems, roleLabel }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden bg-beige-200">
      {/* Sidebar */}
      <aside
        className={`relative flex-shrink-0 bg-olive-600 flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-olive-400 hover:bg-olive-300 flex items-center justify-center shadow-md transition-colors"
        >
          {collapsed
            ? <ChevronRight size={13} className="text-white" />
            : <ChevronLeft  size={13} className="text-white" />}
        </button>

        {/* Logo */}
        <div className={`px-4 py-5 border-b border-olive-500 overflow-hidden ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <span className="text-white font-bold text-lg">S</span>
          ) : (
            <>
              <h1 className="text-white font-bold text-lg tracking-tight whitespace-nowrap">SIS</h1>
              <p className="text-olive-200 text-xs mt-0.5 whitespace-nowrap">Student Information System</p>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to.split('/').length === 2}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-olive-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className={`px-3 py-4 border-t border-olive-500 ${collapsed ? 'flex flex-col items-center gap-3' : ''}`}>
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-khaki-300 flex-shrink-0 flex items-center justify-center text-sm font-semibold text-stone-700">
                {user?.fullName?.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-white text-xs font-medium truncate">{user?.fullName}</p>
                <p className="text-olive-200 text-xs capitalize">{roleLabel}</p>
              </div>
            </div>
          )}

          {collapsed ? (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-olive-200 hover:text-white transition-colors"
            >
              <LogOut size={18} />
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-xs text-olive-200 hover:text-white transition-colors py-1"
            >
              <LogOut size={13} />
              Sign out
            </button>
          )}
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
