import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users as UsersIcon, GraduationCap, BookOpen, Calendar, School, ClipboardList, LayoutGrid, BarChart2, Boxes, Home } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Users from './pages/admin/Users';
import Programs from './pages/admin/Programs';
import Courses from './pages/admin/Courses';
import Terms from './pages/admin/Terms';
import Sections from './pages/admin/Sections';
import Blocks from './pages/admin/Blocks';
import Enrollments from './pages/admin/Enrollments';
import FacultyDashboard from './pages/faculty/Dashboard';
import FacultySections from './pages/faculty/Sections';
import Gradebook from './pages/faculty/Gradebook';
import StudentDashboard from './pages/student/Dashboard';
import StudentGrades from './pages/student/Grades';
import StudentSchedule from './pages/student/Schedule';

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
  { label: 'Terms',       to: '/admin/terms',       icon: Calendar      },
  { label: 'Sections',    to: '/admin/sections',    icon: School        },
  { label: 'Enrollments', to: '/admin/enrollments', icon: ClipboardList },
];

const facultyNav = [
  { label: 'Overview',    to: '/faculty',          icon: Home       },
  { label: 'My Sections', to: '/faculty/sections', icon: LayoutGrid },
];
const studentNav = [
  { label: 'Overview',  to: '/student',          icon: Home      },
  { label: 'My grades', to: '/student/grades',   icon: BarChart2 },
  { label: 'Schedule',  to: '/student/schedule', icon: Calendar  },
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
              <Route path="terms"       element={<Terms />} />
              <Route path="sections"    element={<Sections />} />
              <Route path="enrollments" element={<Enrollments />} />
            </Route>

            {/* Faculty */}
            <Route path="/faculty" element={<><Guard role="faculty" /><AppLayout navItems={facultyNav} roleLabel="Faculty" /></>}>
              <Route index element={<FacultyDashboard />} />
              <Route path="sections" element={<FacultySections />} />
              <Route path="sections/:id" element={<Gradebook />} />
            </Route>

            {/* Student */}
            <Route path="/student" element={<><Guard role="student" /><AppLayout navItems={studentNav} roleLabel="Student" /></>}>
              <Route index element={<StudentDashboard />} />
              <Route path="grades"   element={<StudentGrades />} />
              <Route path="schedule" element={<StudentSchedule />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
