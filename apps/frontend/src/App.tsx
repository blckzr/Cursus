import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users as UsersIcon, GraduationCap, BookOpen, Calendar, School, ClipboardList, LayoutGrid, BarChart2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Users from './pages/admin/Users';
import Programs from './pages/admin/Programs';
import Courses from './pages/admin/Courses';
import Terms from './pages/admin/Terms';
import Sections from './pages/admin/Sections';
import Enrollments from './pages/admin/Enrollments';
import FacultySections from './pages/faculty/Sections';
import Gradebook from './pages/faculty/Gradebook';
import StudentGrades from './pages/student/Grades';

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
  { label: 'Users',       to: '/admin/users',       icon: UsersIcon     },
  { label: 'Programs',    to: '/admin/programs',    icon: GraduationCap },
  { label: 'Courses',     to: '/admin/courses',     icon: BookOpen      },
  { label: 'Terms',       to: '/admin/terms',       icon: Calendar      },
  { label: 'Sections',    to: '/admin/sections',    icon: School        },
  { label: 'Enrollments', to: '/admin/enrollments', icon: ClipboardList },
];

const facultyNav = [{ label: 'My Sections', to: '/faculty', icon: LayoutGrid }];
const studentNav = [{ label: 'My Grades',   to: '/student', icon: BarChart2  }];

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
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin */}
            <Route path="/admin" element={<><Guard role="admin" /><AppLayout navItems={adminNav} roleLabel="Administrator" /></>}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users"       element={<Users />} />
              <Route path="programs"    element={<Programs />} />
              <Route path="courses"     element={<Courses />} />
              <Route path="terms"       element={<Terms />} />
              <Route path="sections"    element={<Sections />} />
              <Route path="enrollments" element={<Enrollments />} />
            </Route>

            {/* Faculty */}
            <Route path="/faculty" element={<><Guard role="faculty" /><AppLayout navItems={facultyNav} roleLabel="Faculty" /></>}>
              <Route index element={<FacultySections />} />
              <Route path="sections/:id" element={<Gradebook />} />
            </Route>

            {/* Student */}
            <Route path="/student" element={<><Guard role="student" /><AppLayout navItems={studentNav} roleLabel="Student" /></>}>
              <Route index element={<StudentGrades />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
