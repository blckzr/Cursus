import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';

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
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Active nav item = the longest `to` that prefixes the current path
  const active = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/'));
  const breadcrumbs = [roleLabel, active?.label].filter(Boolean) as string[];

  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex h-screen overflow-hidden bg-beige-200">
      {/* Sidebar */}
      <aside
        className={`relative flex-shrink-0 bg-olive-600 flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? 'w-16' : 'w-60'
        }`}
        aria-label="Primary navigation"
      >
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-olive-400 hover:bg-olive-300 flex items-center justify-center shadow-md transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={12} className="text-white" />
        </button>

        {/* Brand */}
        <div className={`px-4 py-5 border-b border-olive-500 overflow-hidden ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="w-9 h-9 rounded-xl bg-olive-400 flex items-center justify-center text-white font-bold font-display">C</div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-olive-400 flex items-center justify-center text-white font-bold font-display text-lg shadow-inset-tl">C</div>
              <div className="overflow-hidden">
                <div className="text-white font-semibold tracking-tight font-display text-lg leading-none">Cursus</div>
                <div className="text-olive-200 text-[10px] mt-1 whitespace-nowrap uppercase tracking-wider">Universidad Mariana · MN</div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollable">
          {navItems.map(item => {
            const LucideCmp = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to.split('/').length === 2}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive ? 'bg-white/15 text-white' : 'text-olive-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <LucideCmp size={17} className="flex-shrink-0" />
                {!collapsed && <span className="whitespace-nowrap flex-1">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className={`px-3 py-4 border-t border-olive-500 ${collapsed ? 'flex flex-col items-center gap-3' : ''}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 mb-3 overflow-hidden">
              <Avatar name={user?.fullName} size={32} tone="khaki" />
              <div className="overflow-hidden flex-1">
                <p className="text-white text-xs font-medium truncate">{user?.fullName}</p>
                <p className="text-olive-200 text-[10px] truncate uppercase tracking-wider">{roleLabel}</p>
              </div>
            </div>
          )}
          {collapsed ? (
            <button onClick={handleLogout} title="Sign out" className="text-olive-200 hover:text-white transition-colors">
              <Icon name="log-out" size={17} />
            </button>
          ) : (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-olive-200 hover:text-white transition-colors py-1 font-medium">
              <Icon name="log-out" size={13} /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-20 bg-beige-200/85 backdrop-blur-md border-b border-khaki-100/70">
          <div className="px-7 py-3 flex items-center gap-6">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs text-stone-500 min-w-0 flex-1">
              <Icon name="home" size={12} className="text-stone-400" />
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  <Icon name="chevron-right" size={11} className="text-stone-300" />
                  <span className={i === breadcrumbs.length - 1 ? 'text-stone-700 font-medium truncate' : 'truncate'}>{b}</span>
                </span>
              ))}
            </nav>

            {/* Date */}
            <div className="hidden md:flex items-center gap-2 text-xs text-stone-500">
              <Icon name="calendar" size={12} className="text-stone-400" />
              <span>{today}</span>
            </div>

            {/* Role chip */}
            <div className="flex items-center gap-2 pl-4 border-l border-khaki-200/70">
              <Avatar name={user?.fullName} size={28} tone="olive" />
              <div className="hidden md:block leading-tight">
                <div className="text-xs font-medium text-stone-700 truncate max-w-[140px]">{user?.fullName}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollable">
          <div className="p-7 max-w-[1200px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
