import { useEffect, useState } from 'react';
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

/**
 * Responsive shell.
 *
 * Sidebar behavior:
 *   • Desktop (≥ md): always in flow, toggle collapses width (w-60 ↔ w-14).
 *     Toggle button lives INSIDE the sidebar at the top — no more floating
 *     half-circle hanging off the edge.
 *   • Mobile (< md): hidden by default, slides in as an overlay drawer when
 *     the hamburger in the TopBar is tapped. A semi-transparent backdrop
 *     captures clicks to dismiss.
 */
export default function AppLayout({ navItems, roleLabel }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileOpen]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Active nav item = the longest `to` that prefixes the current path
  const active = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/'));
  const breadcrumbs = [roleLabel, active?.label].filter(Boolean) as string[];

  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  // On mobile the drawer is always "expanded" (full content).
  // On desktop `collapsed` controls width + label visibility.
  const hideLabel = collapsed ? 'md:hidden' : '';
  const justifyCenter = collapsed ? 'md:justify-center' : '';

  return (
    <div className="flex h-screen overflow-hidden bg-beige-200">
      {/* Mobile backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-30 bg-stone-900/40 backdrop-blur-sm transition-opacity ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar — fixed overlay on mobile, in-flow on desktop */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 md:static md:z-auto
          w-64 ${collapsed ? 'md:w-14' : 'md:w-60'}
          bg-olive-600 flex flex-col flex-shrink-0
          transition-transform duration-200 ease-in-out
          md:transition-[width] md:duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Primary navigation"
      >
        {/* Top: toggle (left, fixed) + brand (right of toggle, fades) + close (mobile only, far right) */}
        <div className="flex items-center px-3 py-3 border-b border-olive-500 h-[60px]">
          {/* Desktop toggle — pinned to the LEFT edge, never moves */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex w-9 h-9 rounded-lg items-center justify-center text-olive-100 hover:text-white hover:bg-olive-500/60 transition-colors flex-shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name="panel" size={18} />
          </button>

          {/* Brand — appears to the right of the toggle when expanded, fades on collapse */}
          <div
            className={`flex items-center gap-2.5 min-w-0 overflow-hidden flex-1 md:ml-2 transition-opacity duration-200 ${
              collapsed ? 'md:opacity-0 md:pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-olive-400 flex items-center justify-center text-white font-bold font-display text-lg shadow-inset-tl flex-shrink-0">C</div>
            <div className="overflow-hidden">
              <div className="text-white font-semibold tracking-tight font-display text-lg leading-none">Cursus</div>
              <div className="text-olive-200 text-[10px] mt-0.5 whitespace-nowrap uppercase tracking-wider">Universidad Mariana · MN</div>
            </div>
          </div>

          {/* Mobile close — anchored to the right edge of the drawer */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-olive-100 hover:text-white hover:bg-olive-500/60 transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <Icon name="x" size={18} />
          </button>
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
                  `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${justifyCenter} ${
                    isActive ? 'bg-white/15 text-white' : 'text-olive-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <LucideCmp size={17} className="flex-shrink-0" />
                <span className={`whitespace-nowrap flex-1 ${hideLabel}`}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        <div className={`px-3 py-4 border-t border-olive-500 ${collapsed ? 'md:flex md:flex-col md:items-center md:gap-3' : ''}`}>
          <div className={`flex items-center gap-2.5 mb-3 overflow-hidden ${hideLabel}`}>
            <Avatar name={user?.fullName} size={32} tone="khaki" />
            <div className="overflow-hidden flex-1">
              <p className="text-white text-xs font-medium truncate">{user?.fullName}</p>
              <p className="text-olive-200 text-[10px] truncate uppercase tracking-wider">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-xs text-olive-200 hover:text-white transition-colors py-1 font-medium ${collapsed ? 'md:justify-center' : ''}`}
            title="Sign out"
          >
            <Icon name="log-out" size={collapsed ? 17 : 13} className={collapsed ? 'md:block' : ''} />
            <span className={hideLabel}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="sticky top-0 z-20 bg-beige-200/85 backdrop-blur-md border-b border-khaki-100/70">
          <div className="px-4 md:px-7 py-3 flex items-center gap-3 md:gap-6">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden btn-icon flex-shrink-0"
              aria-label="Open menu"
            >
              <Icon name="panel" size={18} />
            </button>

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs text-stone-500 min-w-0 flex-1">
              <Icon name="home" size={12} className="text-stone-400 flex-shrink-0" />
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  <Icon name="chevron-right" size={11} className="text-stone-300 flex-shrink-0" />
                  <span className={i === breadcrumbs.length - 1 ? 'text-stone-700 font-medium truncate' : 'truncate'}>{b}</span>
                </span>
              ))}
            </nav>

            {/* Date — hidden on small screens */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-stone-500 flex-shrink-0">
              <Icon name="calendar" size={12} className="text-stone-400" />
              <span>{today}</span>
            </div>

            {/* Role chip */}
            <div className="flex items-center gap-2 pl-3 md:pl-4 md:border-l md:border-khaki-200/70 flex-shrink-0">
              <Avatar name={user?.fullName} size={28} tone="olive" />
              <div className="hidden md:block leading-tight">
                <div className="text-xs font-medium text-stone-700 truncate max-w-[140px]">{user?.fullName}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollable">
          <div className="p-4 md:p-7 max-w-[1200px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
