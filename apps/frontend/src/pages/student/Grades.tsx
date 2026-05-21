import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getStudentGrades } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';

export default function StudentGrades() {
  const { user } = useAuth();
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: () => getStudentGrades(user!.id),
    enabled: !!user,
  });

  const statusBadge = (s: string) => {
    if (s === 'enrolled')  return <span className="badge-enrolled">Enrolled</span>;
    if (s === 'dropped')   return <span className="badge-dropped">Dropped</span>;
    return <span className="badge-completed">Completed</span>;
  };

  return (
    <div>
      <PageHeader title="My Grades" subtitle="Your academic record across all enrolled sections" />

      {isLoading ? (
        <div className="text-center text-stone-400 text-sm py-12">Loading…</div>
      ) : grades.length === 0 ? (
        <EmptyState message="You are not enrolled in any sections yet." />
      ) : (
        <div className="space-y-4">
          {/* Group by term */}
          {Object.entries(
            grades.reduce((acc: Record<string, typeof grades>, g: Record<string, string>) => {
              const key = g.term_name;
              if (!acc[key]) acc[key] = [];
              acc[key].push(g);
              return acc;
            }, {}),
          ).map(([term, termGrades]) => (
            <div key={term}>
              <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">{term}</h2>
              <div className="card p-0 overflow-hidden">
                <table className="w-full">
                  <thead><tr>
                    <th className="table-th">Course</th>
                    <th className="table-th">Section</th>
                    <th className="table-th">Units</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Grade</th>
                  </tr></thead>
                  <tbody>
                    {(termGrades as Record<string, string>[]).map(g => (
                      <tr key={g.id} className="hover:bg-beige-50">
                        <td className="table-td">
                          <span className="font-mono text-olive-500 text-xs">{g.course_code}</span>
                          <span className="ml-2">{g.course_title}</span>
                        </td>
                        <td className="table-td text-stone-500">{g.section_code}</td>
                        <td className="table-td">{g.units}</td>
                        <td className="table-td">{statusBadge(g.status)}</td>
                        <td className="table-td text-right">
                          {g.letter_grade ? (
                            <div>
                              <span className="font-bold text-olive-600 text-lg">{g.letter_grade}</span>
                              <span className="text-stone-400 text-xs ml-1">({Number(g.numeric_grade).toFixed(2)})</span>
                            </div>
                          ) : (
                            <span className="text-stone-400 text-sm">In progress</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
