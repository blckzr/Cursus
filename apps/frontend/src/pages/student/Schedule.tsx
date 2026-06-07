import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudentGrades, downloadScheduleIcs } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';

const isActive = (v: unknown) => v === true || v === 'true';

// Mon–Sun grid (post-2.6 multi-meeting model). Sun supports single-meeting
// subjects like NSTP, Sat supports the Wed+Sat standard pair.
const DAYS = [
  { code: 'Mon', short: 'Mon', label: 'Monday' },
  { code: 'Tue', short: 'Tue', label: 'Tuesday' },
  { code: 'Wed', short: 'Wed', label: 'Wednesday' },
  { code: 'Thu', short: 'Thu', label: 'Thursday' },
  { code: 'Fri', short: 'Fri', label: 'Friday' },
  { code: 'Sat', short: 'Sat', label: 'Saturday' },
  { code: 'Sun', short: 'Sun', label: 'Sunday' },
] as const;

function toMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const SLOT_START = toMin('07:00');
const SLOT_END   = toMin('18:00');
const SPAN       = SLOT_END - SLOT_START;
const PX_PER_MIN = 1.3;

/** Today's day code, '' on weekends if we don't care, used for the "now" line. */
function todayCode(): 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun' {
  const map = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const;
  return map[new Date().getDay()];
}

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

  // ── Live "now" indicator ──────────────────────────────────────────────────
  // Tick once a minute so the red line slides down through the day.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowDay = todayCode();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowInRange = nowMin >= SLOT_START && nowMin <= SLOT_END;
  const nowTop = nowInRange ? (nowMin - SLOT_START) * PX_PER_MIN : -1;

  // ── Per-day weekly hours (for the eyebrow stats) ──────────────────────────
  const weeklyMinutes = useMemo(() => {
    let total = 0;
    for (const e of active) {
      for (const m of (e.meetings ?? [])) {
        total += toMin(m.endTime) - toMin(m.startTime);
      }
    }
    return total;
  }, [active]);

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

  // Hour ticks (07:00 → 17:00) drive both the gutter labels and the gridlines.
  const hours: number[] = [];
  for (let h = 7; h <= 17; h++) hours.push(h);

  const headerHours = `${Math.floor(weeklyMinutes / 60)}h ${weeklyMinutes % 60}m`;

  return (
    <div>
      <PageHeader
        eyebrow="This week"
        title="Weekly schedule"
        subtitle={
          active.length === 0
            ? `No active term`
            : `${active.length} section${active.length === 1 ? '' : 's'} · ${headerHours}/week · ${term?.term_name}`
        }
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
        <div className="card !p-0 overflow-hidden">
          {/*
            Horizontal scroll on mobile. The time gutter and header row stay
            sticky so users keep their bearings while swiping.
          */}
          <div className="overflow-x-auto scrollable">
            <div className="grid min-w-[880px] sm:min-w-0" style={{ gridTemplateColumns: '54px repeat(7, minmax(110px, 1fr))' }}>
              {/* ── Header row ───────────────────────────────────────────── */}
              <div className="bg-beige-100 dark:bg-stone-800 border-b border-khaki-200 dark:border-stone-700 sticky left-0 z-10" />
              {DAYS.map(d => {
                const isToday = d.code === nowDay;
                return (
                  <div
                    key={d.code}
                    className={`bg-beige-100 dark:bg-stone-800 border-b border-l border-khaki-200 dark:border-stone-700 px-2 sm:px-3 py-2 text-center transition-colors ${
                      isToday ? 'bg-olive-50 dark:!bg-olive-500/15' : ''
                    }`}
                  >
                    <div className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? 'text-olive-500 dark:text-olive-200' : 'text-stone-400 dark:text-stone-500'}`}>
                      {d.short}
                    </div>
                    <div className={`text-xs font-medium hidden sm:block ${isToday ? 'text-olive-600 dark:text-olive-100' : 'text-stone-700 dark:text-stone-200'}`}>
                      {d.label}
                    </div>
                  </div>
                );
              })}

              {/* ── Time gutter (sticky-left) ────────────────────────────── */}
              <div
                className="relative border-r border-khaki-200 dark:border-stone-700 bg-beige-50 dark:bg-stone-900 sticky left-0 z-10"
                style={{ height: SPAN * PX_PER_MIN }}
              >
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-1.5 text-[10px] text-stone-400 dark:text-stone-500 font-mono tabular text-right"
                    style={{ top: i * 60 * PX_PER_MIN - 6 }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* ── Day columns ──────────────────────────────────────────── */}
              {DAYS.map((d, dayIdx) => {
                const isToday = d.code === nowDay;
                // Even/odd column tint to help readability without being noisy.
                const colTint = dayIdx % 2 === 0
                  ? 'bg-white dark:bg-stone-800/40'
                  : 'bg-beige-50/40 dark:bg-stone-800/70';
                return (
                  <div
                    key={d.code}
                    className={`relative border-l border-khaki-100 dark:border-stone-700/60 ${colTint} ${isToday ? '!bg-olive-50/40 dark:!bg-olive-500/[0.04]' : ''}`}
                    style={{ height: SPAN * PX_PER_MIN }}
                  >
                    {/* Hour gridlines */}
                    {hours.map((_, i) => (
                      <div
                        key={`h-${i}`}
                        className="absolute left-0 right-0 border-t border-stone-200/60 dark:border-stone-700/40"
                        style={{ top: i * 60 * PX_PER_MIN }}
                      />
                    ))}
                    {/* Half-hour dotted gridlines for finer reading */}
                    {hours.map((_, i) => (
                      <div
                        key={`hh-${i}`}
                        className="absolute left-0 right-0 border-t border-dashed border-stone-200/40 dark:border-stone-700/25"
                        style={{ top: i * 60 * PX_PER_MIN + 30 * PX_PER_MIN }}
                      />
                    ))}

                    {/* "Now" line — only on today's column, only if we're in the visible range */}
                    {isToday && nowInRange && (
                      <div
                        className="absolute left-0 right-0 z-10 pointer-events-none"
                        style={{ top: nowTop }}
                        aria-hidden="true"
                      >
                        <div className="relative h-0">
                          <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500 shadow" />
                          <div className="absolute left-0 right-0 top-0 border-t-2 border-red-500/80" />
                        </div>
                      </div>
                    )}

                    {/* Event blocks */}
                    {active.flatMap(e =>
                      (e.meetings || [])
                        .filter((m: any) => m.dayOfWeek === d.code)
                        .map((m: any, mIdx: number) => {
                          const top    = (toMin(m.startTime) - SLOT_START) * PX_PER_MIN;
                          const height = (toMin(m.endTime)   - toMin(m.startTime)) * PX_PER_MIN;
                          return (
                            <div
                              key={`${e.id}-${d.code}-${mIdx}`}
                              className="absolute left-1 right-1 rounded-lg px-2 py-1.5 overflow-hidden
                                         bg-olive-50 border border-olive-300/80 text-olive-700
                                         dark:bg-olive-500/[0.18] dark:border-olive-400/60 dark:text-olive-50
                                         shadow-sm dark:shadow-none
                                         hover:bg-olive-100 hover:border-olive-400 dark:hover:bg-olive-500/25
                                         transition-colors cursor-default"
                              style={{ top, height }}
                              title={`${e.course_code} · ${e.course_title}\n${m.dayOfWeek} ${m.startTime}–${m.endTime}${e.room ? `\n${e.room}` : ''}${e.faculty_name ? `\n${e.faculty_name}` : ''}`}
                            >
                              {/* Colored left rail */}
                              <div className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-olive-400 dark:bg-olive-300" />
                              <div className="pl-1.5">
                                <div className="font-mono text-[11px] font-semibold leading-tight">{e.course_code}</div>
                                <div className="text-[10px] mt-0.5 leading-tight truncate opacity-90">{e.course_title}</div>
                                {e.room && height > 56 && (
                                  <div className="text-[10px] mt-1 leading-tight truncate flex items-center gap-1 opacity-70">
                                    <Icon name="map-pin" size={9} className="flex-shrink-0" />
                                    <span className="truncate">{e.room}</span>
                                  </div>
                                )}
                                {height > 80 && (
                                  <div className="text-[9px] font-mono mt-1 opacity-60 tabular">{m.startTime}–{m.endTime}</div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer legend / mobile hint */}
          <div className="px-3 py-2 text-[10px] text-stone-400 dark:text-stone-500 border-t border-khaki-100 dark:border-stone-700 bg-beige-50 dark:bg-stone-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                Right now
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2 rounded-sm bg-olive-100 border border-olive-300 dark:bg-olive-500/30 dark:border-olive-400/60" />
                Your classes
              </span>
            </div>
            <span className="sm:hidden">← Swipe to see all days →</span>
          </div>
        </div>
      )}
    </div>
  );
}
