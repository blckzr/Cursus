import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users as UsersIcon, GraduationCap, BookOpen, Calendar, School, ClipboardList, LayoutGrid, BarChart2, Boxes, Home, ListTree, Clock, Settings, FileText, FileBadge, Star, TrendingUp, MessageSquare } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './layouts/AppLayout';
// Login + shell stay eager: they're on the critical path for the very first
// paint and small enough that splitting them just costs a round trip.
import Login from './pages/Login';
// Every other route is its own chunk via React.lazy. Vite emits a separate
// JS file per `import('...')` call; the initial bundle drops because users
// only download the page they navigate to. The shell (sidebar, topbar,
// notifications) loads with the first chunk and stays in cache.
const AdminDashboard      = lazy(() => import('./pages/admin/Dashboard'));
const Users               = lazy(() => import('./pages/admin/Users'));
const Programs            = lazy(() => import('./pages/admin/Programs'));
const Courses             = lazy(() => import('./pages/admin/Courses'));
const Curriculum          = lazy(() => import('./pages/admin/Curriculum'));
const Terms               = lazy(() => import('./pages/admin/Terms'));
const Sections            = lazy(() => import('./pages/admin/Sections'));
const Blocks              = lazy(() => import('./pages/admin/Blocks'));
const Enrollments         = lazy(() => import('./pages/admin/Enrollments'));
const AuditLog            = lazy(() => import('./pages/admin/AuditLog'));
const Analytics           = lazy(() => import('./pages/admin/Analytics'));
const AdminAppeals        = lazy(() => import('./pages/admin/Appeals'));
const FacultyDashboard    = lazy(() => import('./pages/faculty/Dashboard'));
const FacultySections     = lazy(() => import('./pages/faculty/Sections'));
const FacultyAvailability = lazy(() => import('./pages/faculty/Availability'));
const Gradebook           = lazy(() => import('./pages/faculty/Gradebook'));
const Roster              = lazy(() => import('./pages/faculty/Roster'));
const FacultySubjects     = lazy(() => import('./pages/faculty/Subjects'));
const FacultyAppeals      = lazy(() => import('./pages/faculty/Appeals'));
const StudentDashboard    = lazy(() => import('./pages/student/Dashboard'));
const StudentGrades       = lazy(() => import('./pages/student/Grades'));
const StudentSchedule     = lazy(() => import('./pages/student/Schedule'));
const StudentCurriculum   = lazy(() => import('./pages/student/Curriculum'));
const StudentCor          = lazy(() => import('./pages/student/COR'));
const StudentWishlist     = lazy(() => import('./pages/student/Wishlist'));
const StudentAppeals      = lazy(() => import('./pages/student/Appeals'));
const Account             = lazy(() => import('./pages/Account'));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,      // data stays fresh for 5 minutes — no refetch during this window
      gcTime: 10 * 60 * 1000,         // keep unused data in memory for 10 minutes
      refetchOnWindowFocus: false,    // don't refetch when switching browser tabs
      refetchOnReconnect: false,      // don't refetch on network reconnect
    },
  },
});

const adminNav = [
  { label: 'Overview',    to: '/admin',             icon: Home          },
  { label: 'Users',       to: '/admin/users',       icon: UsersIcon     },
  { label: 'Programs',    to: '/admin/programs',    icon: GraduationCap },
  { label: 'Blocks',      to: '/admin/blocks',      icon: Boxes         },
  { label: 'Courses',     to: '/admin/courses',     icon: BookOpen      },
  { label: 'Curriculum',  to: '/admin/curriculum',  icon: ListTree      },
  { label: 'Terms',       to: '/admin/terms',       icon: Calendar      },
  { label: 'Sections',    to: '/admin/sections',    icon: School        },
  { label: 'Enrollments', to: '/admin/enrollments', icon: ClipboardList },
  { label: 'Appeals',     to: '/admin/appeals',     icon: MessageSquare },
  { label: 'Analytics',   to: '/admin/analytics',   icon: TrendingUp    },
  { label: 'Activity log',to: '/admin/audit-log',   icon: FileText      },
  { label: 'Account',     to: '/admin/account',     icon: Settings      },
];

const facultyNav = [
  { label: 'Overview',      to: '/faculty',              icon: Home          },
  { label: 'My Sections',   to: '/faculty/sections',     icon: LayoutGrid    },
  { label: 'My Subjects',   to: '/faculty/subjects',     icon: BookOpen      },
  { label: 'Availability',  to: '/faculty/availability', icon: Clock         },
  { label: 'Appeals',       to: '/faculty/appeals',      icon: MessageSquare },
  { label: 'Account',       to: '/faculty/account',      icon: Settings      },
];
const studentNav = [
  { label: 'Overview',   to: '/student',            icon: Home          },
  { label: 'Curriculum', to: '/student/curriculum', icon: ListTree      },
  { label: 'My grades',  to: '/student/grades',     icon: BarChart2     },
  { label: 'Schedule',   to: '/student/schedule',   icon: Calendar      },
  { label: 'Wishlist',   to: '/student/wishlist',   icon: Star          },
  { label: 'COR',        to: '/student/cor',        icon: FileBadge     },
  { label: 'Appeals',    to: '/student/appeals',    icon: MessageSquare },
  { label: 'Account',    to: '/student/account',    icon: Settings      },
];

function Guard({ role }: { role: 'admin' | 'faculty' | 'student' }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return null;
}

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin */}
            <Route path="/admin" element={<><Guard role="admin" /><AppLayout navItems={adminNav} roleLabel="Administrator" /></>}>
              <Route index element={<AdminDashboard />} />
              <Route path="users"       element={<Users />} />
              <Route path="programs"    element={<Programs />} />
              <Route path="blocks"      element={<Blocks />} />
              <Route path="courses"     element={<Courses />} />
              <Route path="curriculum"  element={<Curriculum />} />
              <Route path="terms"       element={<Terms />} />
              <Route path="sections"    element={<Sections />} />
              <Route path="enrollments" element={<Enrollments />} />
              <Route path="appeals"     element={<AdminAppeals />} />
              <Route path="analytics"   element={<Analytics />} />
              <Route path="audit-log"   element={<AuditLog />} />
              <Route path="account"     element={<Account />} />
            </Route>

            {/* Faculty */}
            <Route path="/faculty" element={<><Guard role="faculty" /><AppLayout navItems={facultyNav} roleLabel="Faculty" /></>}>
              <Route index element={<FacultyDashboard />} />
              <Route path="sections" element={<FacultySections />} />
              <Route path="sections/:id" element={<Gradebook />} />
              <Route path="sections/:id/roster" element={<Roster />} />
              <Route path="subjects"     element={<FacultySubjects />} />
              <Route path="availability" element={<FacultyAvailability />} />
              <Route path="appeals"      element={<FacultyAppeals />} />
              <Route path="account"      element={<Account />} />
            </Route>

            {/* Student */}
            <Route path="/student" element={<><Guard role="student" /><AppLayout navItems={studentNav} roleLabel="Student" /></>}>
              <Route index element={<StudentDashboard />} />
              <Route path="curriculum" element={<StudentCurriculum />} />
              <Route path="grades"     element={<StudentGrades />} />
              <Route path="schedule"   element={<StudentSchedule />} />
              <Route path="wishlist"   element={<StudentWishlist />} />
              <Route path="cor"        element={<StudentCor />} />
              <Route path="appeals"    element={<StudentAppeals />} />
              <Route path="account"    element={<Account />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
