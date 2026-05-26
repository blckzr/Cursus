import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurriculumProgress, downloadTranscript } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import ProgressBar from '../../components/ProgressBar';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';

type Status = 'completed' | 'current' | 'pending' | 'locked';

const STATUS_ICON: Record<Status, string> = {
  completed: 'check',
  current:   'clock',
  pending:   'inbox',
  locked:    'alert-triangle',
};
const STATUS_RING: Record<Status, string> = {
  completed: 'bg-olive-100 text-olive-500',
  current:   'bg-khaki-50  text-khaki-500',
  pending:   'bg-stone-100 text-stone-400',
  locked:    'bg-red-50    text-red-500',
};
const STATUS_DOT: Record<Status, string> = {
  completed: 'bg-olive-400',
  current:   'bg-khaki-400',
  pending:   'bg-stone-300',
  locked:    'bg-red-400',
};

const SEM_LABEL: Record<string, string> = { '1': '1st Semester', '2': '2nd Semester', summer: 'Summer' };
const semSortKey = (s: string) => (s === '1' ? 1 : s === '2' ? 2 : 3);

interface Entry {
  yearLevel:   number;
  semester:    '1' | '2' | 'summer';
  displayOrder: number;
  courseId:    string;
  courseCode:  string;
  courseTitle: string;
  units:       number;
  status:      Status;
  grade:       { numeric: number; letter: string } | null;
  blockedBy:   string[];
  termName:    string | null;
}

interface ProgressResponse {
  program: { code: string; name: string; total_units: number } | null;
  entries: Entry[];
}

export default function StudentCurriculum() {
  const toast = useToast();
  const { data, isLoading } = useQuery<ProgressResponse>({
    queryKey: ['curriculum-progress'],
    queryFn:  getCurriculumProgress,
  });

  const [filter, setFilter] = useState<'all' | Status>('all');

  const entries = data?.entries ?? [];
  const program = data?.program;

  // Aggregate progress stats
  const stats = useMemo(() => {
    const counts = { completed: 0, current: 0, pending: 0, locked: 0 };
    let unitsDone = 0, unitsTotal = 0;
    for (const e of entries) {
      counts[e.status]++;
      unitsTotal += Number(e.units);
      if (e.status === 'completed') unitsDone += Number(e.units);
    }
    return { ...counts, unitsDone, unitsTotal, pct: unitsTotal ? (unitsDone / unitsTotal) * 100 : 0 };
  }, [entries]);

  // Group: year → semester → entries (after filtering)
  const grouped = useMemo(() => {
    const map = new Map<number, Map<string, Entry[]>>();
    for (const e of entries) {
      if (filter !== 'all' && e.status !== filter) continue;
      if (!map.has(e.yearLevel)) map.set(e.yearLevel, new Map());
      const yearMap = map.get(e.yearLevel)!;
      if (!yearMap.has(e.semester)) yearMap.set(e.semester, []);
      yearMap.get(e.semester)!.push(e);
    }
    return map;
  }, [entries, filter]);

  const handleDownload = async () => {
    try {
      await downloadTranscript();
      toast.push({ tone: 'success', title: 'Transcript downloaded' });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed' });
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Roadmap"
        title="My curriculum"
        subtitle={program ? program.name : 'No program assigned yet'}
        action={
          <button onClick={handleDownload} className="btn-secondary flex items-center gap-2">
            <Icon name="download" size={14} /> Download transcript
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : !program ? (
        <div className="card p-0">
          <EmptyState icon="graduation-cap" title="No program assigned"
            message="Talk to the Registrar to be assigned to a program." />
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-0">
          <EmptyState icon="graduation-cap" title="Curriculum not built yet"
            message={`The ${program.code} curriculum is empty. Once it's set up by the Registrar your roadmap will appear here.`} />
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <div className="card mb-5">
            <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Overall progress</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-display tabular text-3xl font-medium text-stone-800">{stats.unitsDone}</span>
                  <span className="text-stone-400 text-sm">/ {stats.unitsTotal} units</span>
                </div>
              </div>
              <div className="text-3xl font-display tabular font-medium text-olive-500">{Math.round(stats.pct)}%</div>
            </div>
            <ProgressBar value={stats.pct} />
            <div className="mt-4 flex items-center gap-4 text-xs text-stone-600 flex-wrap">
              <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${STATUS_DOT.completed}`} /> {stats.completed} completed</span>
              <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${STATUS_DOT.current}`} /> {stats.current} in progress</span>
              <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${STATUS_DOT.pending}`} /> {stats.pending} pending</span>
              <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${STATUS_DOT.locked}`} /> {stats.locked} locked</span>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <Chip active={filter === 'all'}        onClick={() => setFilter('all')}>All ({entries.length})</Chip>
            <Chip active={filter === 'completed'}  onClick={() => setFilter('completed')}>Completed ({stats.completed})</Chip>
            <Chip active={filter === 'current'}    onClick={() => setFilter('current')}>In progress ({stats.current})</Chip>
            <Chip active={filter === 'pending'}    onClick={() => setFilter('pending')}>Pending ({stats.pending})</Chip>
            <Chip active={filter === 'locked'}     onClick={() => setFilter('locked')}>Locked ({stats.locked})</Chip>
          </div>

          {/* Year cards */}
          <div className="space-y-5">
            {[...grouped.entries()].sort(([a], [b]) => a - b).map(([year, sems]) => (
              <section key={year} className="card !p-0 overflow-hidden">
                <div className="px-4 py-3 bg-beige-50 border-b border-beige-200">
                  <h2 className="text-base font-semibold text-stone-800">Year {year}</h2>
                </div>
                <div className="divide-y divide-beige-200">
                  {[...sems.entries()].sort(([a], [b]) => semSortKey(a) - semSortKey(b)).map(([sem, items]) => {
                    const semUnits = items.reduce((s, e) => s + Number(e.units), 0);
                    return (
                      <div key={sem} className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <h3 className="text-sm font-medium text-stone-700">{SEM_LABEL[sem]}</h3>
                          <span className="text-xs text-stone-400 tabular">{items.length} course{items.length === 1 ? '' : 's'} · {semUnits}u</span>
                        </div>
                        <ul className="space-y-1">
                          {items.map(e => <CourseRow key={e.courseId} entry={e} />)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CourseRow({ entry }: { entry: Entry }) {
  return (
    <li className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-beige-50 transition-colors"
        title={entry.status === 'locked' ? `Locked — needs: ${entry.blockedBy.join(', ')}` : undefined}>
      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${STATUS_RING[entry.status]}`}>
        <Icon name={STATUS_ICON[entry.status]} size={12} />
      </span>
      <span className="font-mono text-xs font-semibold text-olive-600 w-24 flex-shrink-0">{entry.courseCode}</span>
      <span className="flex-1 min-w-0 text-sm text-stone-700 truncate">{entry.courseTitle}</span>
      <span className="text-[10px] text-stone-400 tabular w-8 text-right flex-shrink-0">{entry.units}u</span>
      <span className="text-xs tabular w-28 text-right flex-shrink-0">
        {entry.status === 'completed' && entry.grade && (
          <>
            <span className="font-display font-semibold text-olive-600 text-base">{entry.grade.letter}</span>
            <span className="text-stone-400 text-[10px] ml-1">({entry.grade.numeric.toFixed(2)})</span>
          </>
        )}
        {entry.status === 'current' && (
          <span className="text-khaki-500 font-medium">{entry.termName ?? 'In progress'}</span>
        )}
        {entry.status === 'pending' && (
          <span className="text-stone-400">Pending</span>
        )}
        {entry.status === 'locked' && (
          <span className="text-red-500 font-medium">Locked</span>
        )}
      </span>
    </li>
  );
}
