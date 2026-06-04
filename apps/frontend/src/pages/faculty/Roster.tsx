import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { getRoster, downloadRosterCsv } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import DataTable, { type DataTableHeader } from '../../components/DataTable';
import TableSkeleton from '../../components/TableSkeleton';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';

// Mobile keeps User code, Name, Status (the at-a-glance enrolled/dropped/completed badge).
// Email and Year level collapse below sm/md.
const HEADERS: DataTableHeader[] = [
  { label: 'User code' },
  { label: 'Name' },
  { label: 'Email',  hideBelow: 'md' },
  { label: 'Year',   hideBelow: 'sm' },
  { label: 'Status' },
];

export default function Roster() {
  const { id: sectionId } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['roster', sectionId],
    queryFn:  () => getRoster(sectionId!),
    enabled:  !!sectionId,
  });

  const section  = data?.section;
  const students = (data?.students ?? []) as {
    id: string; user_code: string | null; full_name: string; email: string;
    year_level: number | null; status: string;
  }[];

  const handleDownload = async () => {
    try {
      await downloadRosterCsv(sectionId!);
      toast.push({ tone: 'success', title: 'Roster downloaded' });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed' });
    }
  };
  const handlePrint = () => window.print();

  return (
    <div>
      <Link to={`/faculty/sections/${sectionId}`} className="text-xs text-stone-500 hover:text-olive-500 mb-3 flex items-center gap-1 no-print">
        <Icon name="chevron-left" size={12} /> Back to gradebook
      </Link>

      <PageHeader
        eyebrow={section?.term_name}
        title={section?.course_title || 'Roster'}
        subtitle={
          section ? (
            <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
              <span className="font-mono font-semibold text-olive-500">{section.section_code}</span>
              {section.day_of_week && (
                <><span className="hidden sm:inline">·</span><span><span className="font-mono">{section.day_of_week}</span> · {section.start_time?.slice(0,5)}–{section.end_time?.slice(0,5)}</span></>
              )}
              {section.room && <><span className="hidden sm:inline">·</span><span className="flex items-center gap-1"><Icon name="map-pin" size={11} /> {section.room}</span></>}
              {section.faculty_name && <><span className="hidden sm:inline">·</span><span className="flex items-center gap-1"><Icon name="user" size={11} /> {section.faculty_name}</span></>}
              <span className="hidden sm:inline">·</span>
              <span className="flex items-center gap-1"><Icon name="users" size={11} /> {students.length} enrolled</span>
            </span>
          ) : null
        }
        action={
          <div className="flex items-center gap-2 no-print">
            <button className="btn-secondary flex items-center gap-2" onClick={handleDownload}>
              <Icon name="download" size={14} /> CSV
            </button>
            <button className="btn-secondary flex items-center gap-2" onClick={handlePrint}>
              <Icon name="copy" size={14} /> Print
            </button>
          </div>
        }
      />

      {isLoading ? (
        <TableSkeleton headers={HEADERS} rows={10} />
      ) : students.length === 0 ? (
        <div className="card p-0">
          <EmptyState icon="users" title="No students enrolled"
            message="When the term is opened, students from this block will appear here." />
        </div>
      ) : (
        <DataTable headers={HEADERS} pageSize={10}>
          {students.map(s => (
            <tr key={s.id} className="hover:bg-beige-50 transition-colors">
              <td className="table-td">
                <span className="font-mono text-xs bg-beige-100 text-olive-600 px-2 py-1 rounded font-semibold tracking-wide">
                  {s.user_code ?? '—'}
                </span>
              </td>
              <td className="table-td">
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.full_name} size={28} tone="beige" />
                  <span className="font-medium text-stone-800">{s.full_name}</span>
                </div>
              </td>
              <td className="table-td text-stone-500 text-xs hidden md:table-cell">{s.email}</td>
              <td className="table-td text-stone-500 hidden sm:table-cell">{s.year_level ?? '—'}</td>
              <td className="table-td">
                {s.status === 'completed'
                  ? <span className="badge badge-completed">Completed</span>
                  : s.status === 'dropped'
                  ? <span className="badge badge-dropped">Dropped</span>
                  : <span className="badge badge-enrolled">Enrolled</span>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
