import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getGradebook } from '../../api';
import Icon from '../../components/Icon';

interface Props {
  section: any;
  basePath?: string;
}

/** Card preview of a section — fetches its own gradebook for live avg/at-risk stats. */
export default function FacultySectionCard({ section, basePath = '/faculty/sections' }: Props) {
  const { data } = useQuery({
    queryKey: ['gradebook', section.id],
    queryFn: () => getGradebook(section.id),
  });

  const students: any[] = data?.students || [];
  const enrolled = students.length;
  const graded = students.filter(s => s.computedGrade != null);
  const avg = graded.length ? graded.reduce((s, e) => s + e.computedGrade, 0) / graded.length : null;
  const atRisk = students.filter(s => s.computedGrade != null && s.computedGrade < 75).length;

  return (
    <Link
      to={`${basePath}/${section.id}`}
      className="card text-left hover:border-olive-200 hover:shadow-pop transition-all group flex flex-col"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold text-olive-500 truncate">{section.section_code}</div>
          <div className="font-medium text-stone-800 text-sm mt-1 leading-tight line-clamp-2">{section.course_title}</div>
        </div>
        {atRisk > 0 && (
          <span className="badge badge-dropped flex items-center gap-0.5 flex-shrink-0">
            <Icon name="alert-triangle" size={10} /> {atRisk}
          </span>
        )}
      </div>

      <div className="text-xs text-stone-500 mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap">
        {section.day_of_week && (
          <span className="flex items-center gap-1">
            <Icon name="calendar" size={11} />
            <span className="font-mono">{section.day_of_week}</span>
            <span className="tabular">· {String(section.start_time ?? '').slice(0, 5)}–{String(section.end_time ?? '').slice(0, 5)}</span>
          </span>
        )}
        {section.room && (
          <span className="flex items-center gap-1 min-w-0">
            <Icon name="map-pin" size={11} className="flex-shrink-0" />
            <span className="truncate">{section.room}</span>
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center pt-3 border-t border-beige-200">
        <div>
          <div className="text-base font-semibold tabular text-stone-800">{enrolled}</div>
          <div className="text-[10px] text-stone-400 uppercase tracking-wider">Students</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular text-stone-800">{avg != null ? avg.toFixed(1) : '—'}</div>
          <div className="text-[10px] text-stone-400 uppercase tracking-wider">Avg</div>
        </div>
        <div>
          <div className={`text-base font-semibold tabular ${atRisk > 0 ? 'text-red-500' : 'text-stone-800'}`}>{atRisk}</div>
          <div className="text-[10px] text-stone-400 uppercase tracking-wider">At risk</div>
        </div>
      </div>
    </Link>
  );
}
