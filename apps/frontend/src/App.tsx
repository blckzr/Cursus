import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users as UsersIcon, GraduationCap, BookOpen, Calendar, School, ClipboardList, LayoutGrid, BarChart2, Boxes, Home, ListTree, Clock, Settings, FileText, FileBadge, Star, TrendingUp } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Users from './pages/admin/Users';
import Programs from './pages/admin/Programs';
import Courses from './pages/admin/Courses';
import Curriculum from './pages/admin/Curriculum';
import Terms from './pages/admin/Terms';
import Sections from './pages/admin/Sections';
import Blocks from './pages/admin/Blocks';
import Enrollments from './pages/admin/Enrollments';
import AuditLog from './pages/admin/AuditLog';
import Analytics from './pages/admin/Analytics';
import FacultyDashboard from './pages/faculty/Dashboard';
import FacultySections from './pages/faculty/Sections';
import FacultyAvailability from './pages/faculty/Availability';
import Gradebook from './pages/faculty/Gradebook';
import Roster from './pages/faculty/Roster';
import FacultySubjects from './pages/faculty/Subjects';
import StudentDashboard from './pages/student/Dashboard';
import StudentGrades from './pages/student/Grades';
import StudentSchedule from './pages/student/Schedule';
import StudentCurriculum from './pages/student/Curriculum';
import StudentCor from './pages/student/COR';
import StudentWishlist from './pages/student/Wishlist';
import Account from './pages/Account';

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
  { label: 'Analytics',   to: '/admin/analytics',   icon: TrendingUp    },
  { label: 'Activity log',to: '/admin/audit-log',   icon: FileText      },
  { label: 'Account',     to: '/admin/account',     icon: Settings      },
];

const facultyNav = [
  { label: 'Overview',      to: '/faculty',              icon: Home       },
  { label: 'My Sections',   to: '/faculty/sections',     icon: LayoutGrid },
  { label: 'My Subjects',   to: '/faculty/subjects',     icon: BookOpen   },
  { label: 'Availability',  to: '/faculty/availability', icon: Clock      },
  { label: 'Account',       to: '/faculty/account',      icon: Settings   },
];
const studentNav = [
  { label: 'Overview',   to: '/student',            icon: Home       },
  { label: 'Curriculum', to: '/student/curriculum', icon: ListTree   },
  { label: 'My grades',  to: '/student/grades',     icon: BarChart2  },
  { label: 'Schedule',   to: '/student/schedule',   icon: Calendar   },
  { label: 'Wishlist',   to: '/student/wishlist',   icon: Star       },
  { label: 'COR',        to: '/student/cor',        icon: FileBadge  },
  { label: 'Account',    to: '/student/account',    icon: Settings   },
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
              <Route path="account"    element={<Account />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
