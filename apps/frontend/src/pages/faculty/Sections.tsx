import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, ArrowRight } from 'lucide-react';
import { getSections } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';

export default function FacultySections() {
  const { data: sections = [], isLoading } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });

  return (
    <div>
      <PageHeader title="My Sections" subtitle="Your assigned course sections this term" />
      {isLoading ? (
        <div className="text-center text-stone-400 text-sm py-12">Loading…</div>
      ) : sections.length === 0 ? (
        <EmptyState message="No sections assigned to you yet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s: Record<string, string>) => (
            <Link key={s.id} to={`/faculty/sections/${s.id}`}
              className="card hover:shadow-md hover:border-khaki-300 transition-all group cursor-pointer">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-olive-500 font-semibold text-sm">{s.section_code}</span>
                  <h3 className="font-semibold text-stone-800 mt-0.5">{s.course_title}</h3>
                  <p className="text-stone-500 text-sm mt-1">{s.term_name}</p>
                </div>
                <ArrowRight size={18} className="text-stone-300 group-hover:text-olive-400 transition-colors mt-0.5" />
              </div>
              {s.day_of_week && (
                <p className="text-xs text-stone-400 mt-3 flex items-center gap-1.5">
                  <Calendar size={12} />
                  {s.day_of_week} {s.start_time}–{s.end_time} {s.room && `· ${s.room}`}
                </p>
              )}
              <p className="text-xs text-stone-400 mt-1">Capacity: {s.capacity}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
