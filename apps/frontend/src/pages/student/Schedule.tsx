import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudentGrades, downloadScheduleIcs } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';

const isActive = (v: unknown) => v === true || v === 'true';

const DAYS = [
  { code: 'M',  label: 'Monday' },
  { code: 'T',  label: 'Tuesday' },
  { code: 'W',  label: 'Wednesday' },
  { code: 'Th', label: 'Thursday' },
  { code: 'F',  label: 'Friday' },
];

function meetsOn(daysStr: string | null | undefined, code: string): boolean {
  if (!daysStr) return false;
  if (code === 'Th') return /Th/.test(daysStr);
  return daysStr.replace(/Th/g, '').includes(code);
}

function toMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const SLOT_START = toMin('07:00');
const SLOT_END   = toMin('18:00');
const SPAN       = SLOT_END - SLOT_START;
const PX_PER_MIN = 1.2;

export default function StudentSchedule() {
  const { user } = useAuth();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: () => getStudentGrades(user!.id),
    enabled: !!user,
  });

  const active: any[] = useMemo(
    () => grades.filter((e: any) => isActive(e.term_is_active) && e.status === 'enrolled'),
    [grades],
  );
  const term: any = active[0];

  const handleAddToCalendar = async () => {
    setDownloading(true);
    try {
      await downloadScheduleIcs();
      toast.push({
        tone: 'success',
        title: 'Schedule downloaded',
        message: 'Open the .ics file with Google Calendar, Apple Calendar, or Outlook to import.',
      });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed', message: 'Try again in a moment.' });
    } finally {
      setDownloading(false);
    }
  };

  const timeSlots: string[] = [];
  for (let h = 7; h <= 17; h++) timeSlots.push(`${String(h).padStart(2, '0')}:00`);

  return (
    <div>
      <PageHeader
        eyebrow="This week"
        title="Weekly schedule"
        subtitle={`${active.length} section${active.length === 1 ? '' : 's'} · ${term?.term_name || 'No active term'}`}
        action={active.length > 0 && (
          <button
            onClick={handleAddToCalendar}
            disabled={downloading}
            className="btn-secondary flex items-center gap-2"
            title="Download an .ics file you can import into Google Calendar, Apple Calendar, or Outlook"
          >
            <Icon name="calendar" size={14} />
            {downloading
              ? 'Preparing…'
              : <><span className="hidden sm:inline">Add to calendar</span><span className="sm:hidden">Calendar</span></>}
          </button>
        )}
      />

      {isLoading ? (
        <div className="card p-4"><Skeleton className="h-[600px] rounded-lg" /></div>
      ) : active.length === 0 ? (
        <div className="card p-0"><EmptyState icon="calendar" title="Nothing scheduled" message="You aren't enrolled in any courses this term." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/*
            Horizontal scroll on mobile: the time gutter stays sticky so users
            keep their bearings while swiping. Day columns get a sane min-width
            so they don't squeeze into unreadable strips.
          */}
          <div className="overflow-x-auto scrollable">
            <div className="grid min-w-[640px] sm:min-w-0" style={{ gridTemplateColumns: '52px repeat(5, minmax(110px, 1fr))' }}>
              {/* Header row */}
              <div className="bg-beige-50 border-b border-khaki-100 sticky left-0 z-10" />
              {DAYS.map(d => (
                <div key={d.code} className="bg-beige-50 border-b border-l border-khaki-100 px-2 sm:px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-stone-400">{d.code === 'Th' ? 'Thu' : d.label.slice(0, 3)}</div>
                  <div className="text-xs font-medium text-stone-700 hidden sm:block">{d.label}</div>
                </div>
              ))}

              {/* Time gutter — sticky to the left while users swipe horizontally */}
              <div className="relative border-r border-khaki-100 bg-white sticky left-0 z-10" style={{ height: SPAN * PX_PER_MIN }}>
                {timeSlots.map(t => (
                  <div key={t} className="absolute left-0 right-0 text-[10px] text-stone-400 font-mono pr-1 text-right"
                    style={{ top: (toMin(t) - SLOT_START) * PX_PER_MIN - 6 }}>
                    {t}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map(d => (
                <div key={d.code} className="relative border-l border-khaki-100" style={{ height: SPAN * PX_PER_MIN }}>
                  {timeSlots.map(t => (
                    <div key={t} className="absolute left-0 right-0 border-t border-beige-200/60"
                      style={{ top: (toMin(t) - SLOT_START) * PX_PER_MIN }} />
                  ))}
                  {active.filter(e => meetsOn(e.day_of_week, d.code)).map(e => {
                    const top    = (toMin(e.start_time) - SLOT_START) * PX_PER_MIN;
                    const height = (toMin(e.end_time) - toMin(e.start_time)) * PX_PER_MIN;
                    return (
                      <div
                        key={`${e.id}-${d.code}`}
                        className="absolute left-1 right-1 rounded-lg p-2 bg-olive-50 border border-olive-200 text-olive-600 dark:bg-olive-500/20 dark:border-olive-400/50 dark:text-olive-100 overflow-hidden"
                        style={{ top, height }}
                      >
                        <div className="font-mono text-[11px] font-semibold leading-none">{e.course_code}</div>
                        <div className="text-[10px] mt-1 leading-tight truncate">{e.course_title}</div>
                        {e.room && <div className="text-[10px] text-olive-400 dark:text-olive-200 mt-1 leading-tight truncate">{e.room}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="px-3 py-2 sm:hidden text-[10px] text-stone-400 border-t border-beige-200 bg-beige-50">
            ← Swipe horizontally to see all days →
          </div>
        </div>
      )}
    </div>
  );
}
