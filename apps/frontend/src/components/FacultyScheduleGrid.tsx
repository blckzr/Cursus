import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvailability, getSections } from '../api';
import { DAY_ORDER, DAY_LABEL, parseDays, timeToMin, type DayCode } from '../lib/days';
import Skeleton from './Skeleton';
import Icon from './Icon';

// 07:00 → 18:00, rendered as a continuous timeline (minute-level resolution).
const START_MIN  = 7  * 60;            // 420
const END_MIN    = 18 * 60;            // 1080
const HOUR_COUNT = (END_MIN - START_MIN) / 60;     // 11
const BODY_HEIGHT = 440;                            // px
const PX_PER_MIN  = BODY_HEIGHT / (END_MIN - START_MIN);

type CellState =
  | 'free'
  | 'office'
  | 'booked'
  | 'unavailable'
  | 'proposed-good'
  | 'proposed-conflict';

const STATE_CLS: Record<CellState, string> = {
  free:                'bg-olive-100',
  office:              'bg-amber-100',
  booked:              'bg-red-100',
  unavailable:         '',                                  // background shows through
  'proposed-good':     'bg-olive-400',
  'proposed-conflict': 'bg-red-300 ring-2 ring-red-500 ring-inset',
};

interface Block { start: number; end: number; state: CellState; }

interface Slot { days: DayCode[]; start: number; end: number; kind: 'teaching' | 'office_hour'; }
interface Commitment { days: DayCode[]; start: number; end: number; }
interface Proposed { days: DayCode[]; start: number; end: number; }

interface Props {
  facultyId:         string | null | undefined;
  termId:            string | null | undefined;
  excludeSectionId?: string;
  proposed?: {
    dayOfWeek: string;
    startTime: string;
    endTime:   string;
  };
}

function formatMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Walk minute-by-minute across the day, resolve each minute's state by
 * priority, then collapse consecutive equal states into single blocks.
 *
 * Priority (highest wins): proposed > booked > office > free > unavailable.
 * When 'proposed' overlaps anything that breaks rules (booked / office /
 * outside teaching window) it becomes 'proposed-conflict'.
 */
function computeBlocks(
  day: DayCode,
  slots: Slot[],
  commits: Commitment[],
  proposed: Proposed | null,
): Block[] {
  const N = END_MIN - START_MIN;
  const states: CellState[] = new Array(N);
  const hasAvailability = slots.length > 0;

  for (let i = 0; i < N; i++) {
    const m = i + START_MIN;
    const inFree    = slots.some(s => s.kind === 'teaching'    && s.days.includes(day) && s.start <= m && s.end > m);
    const inOffice  = slots.some(s => s.kind === 'office_hour' && s.days.includes(day) && s.start <= m && s.end > m);
    const inBooked  = commits.some(c => c.days.includes(day) && c.start <= m && c.end > m);
    const inProposed = !!(proposed && proposed.days.includes(day) && proposed.start <= m && proposed.end > m);

    let s: CellState = 'unavailable';
    if (inFree)   s = 'free';
    if (inOffice) s = 'office';
    if (inBooked) s = 'booked';

    if (inProposed) {
      const conflict = inOffice || inBooked || (hasAvailability && !inFree);
      s = conflict ? 'proposed-conflict' : 'proposed-good';
    }

    states[i] = s;
  }

  const blocks: Block[] = [];
  let bs = 0;
  let cur = states[0];
  for (let i = 1; i < N; i++) {
    if (states[i] !== cur) {
      blocks.push({ start: bs + START_MIN, end: i + START_MIN, state: cur });
      bs = i;
      cur = states[i];
    }
  }
  blocks.push({ start: bs + START_MIN, end: N + START_MIN, state: cur });
  return blocks.filter(b => b.state !== 'unavailable');
}

export default function FacultyScheduleGrid({ facultyId, termId, excludeSectionId, proposed }: Props) {
  const { data: rawSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['availability', facultyId],
    queryFn:  () => getAvailability(facultyId!),
    enabled:  !!facultyId,
  });
  const { data: rawSections = [], isLoading: loadingSecs } = useQuery({
    queryKey: ['sections', { facultyId, termId }],
    queryFn:  () => getSections({ facultyId, termId }),
    enabled:  !!facultyId && !!termId,
  });

  const slots: Slot[] = useMemo(
    () => (rawSlots as { day_of_week: string; start_time: string; end_time: string; kind: 'teaching' | 'office_hour' }[])
      .map(s => ({
        days:  parseDays(s.day_of_week),
        start: timeToMin(s.start_time),
        end:   timeToMin(s.end_time),
        kind:  s.kind,
      })),
    [rawSlots],
  );

  const commits: Commitment[] = useMemo(
    () => (rawSections as { id: string; day_of_week: string | null; start_time: string | null; end_time: string | null }[])
      .filter(s => s.id !== excludeSectionId && s.day_of_week && s.start_time && s.end_time)
      .map(s => ({
        days:  parseDays(s.day_of_week!),
        start: timeToMin(s.start_time!),
        end:   timeToMin(s.end_time!),
      })),
    [rawSections, excludeSectionId],
  );

  const proposedRange: Proposed | null = useMemo(() => {
    if (!proposed?.dayOfWeek || !proposed.startTime || !proposed.endTime) return null;
    const start = timeToMin(proposed.startTime);
    const end   = timeToMin(proposed.endTime);
    if (end <= start) return null;
    return { days: parseDays(proposed.dayOfWeek), start, end };
  }, [proposed]);

  const dayBlocks = useMemo(() => {
    const out: Record<DayCode, Block[]> = {} as Record<DayCode, Block[]>;
    for (const d of DAY_ORDER) out[d] = computeBlocks(d, slots, commits, proposedRange);
    return out;
  }, [slots, commits, proposedRange]);

  if (!facultyId) {
    return (
      <div className="rounded-lg bg-beige-50 border border-beige-200 p-4 text-xs text-stone-500 text-center">
        Pick a faculty member above to see their weekly schedule.
      </div>
    );
  }
  if (loadingSlots || loadingSecs) return <Skeleton className="h-[480px] rounded-lg" />;

  const noAvailability = slots.length === 0;

  return (
    <div>
      {noAvailability && (
        <div className="mb-2 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 flex items-start gap-2">
          <Icon name="alert-triangle" size={12} className="mt-0.5 flex-shrink-0" />
          <span>This faculty hasn't set their availability yet. The system will accept any assignment without validation — proceed carefully.</span>
        </div>
      )}

      <div className="border border-beige-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 480 }}>
        {/* Header */}
        <div className="flex bg-beige-50 border-b border-beige-200">
          <div className="w-12 flex-shrink-0" />
          {DAY_ORDER.map(d => (
            <div key={'h-' + d} className="flex-1 text-center text-[10px] uppercase tracking-wider text-stone-500 font-medium py-1.5">
              {DAY_LABEL[d]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex" style={{ height: BODY_HEIGHT }}>
          {/* Time gutter */}
          <div className="w-12 bg-beige-50 relative flex-shrink-0">
            {Array.from({ length: HOUR_COUNT + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute right-1.5 text-[10px] text-stone-400 font-mono"
                style={{ top: i * 60 * PX_PER_MIN - 5 }}
              >
                {String(7 + i).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAY_ORDER.map(d => (
            <div key={d} className="flex-1 border-l border-beige-200 relative">
              {/* Hour gridlines */}
              {Array.from({ length: HOUR_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-beige-100"
                  style={{ top: (i + 1) * 60 * PX_PER_MIN }}
                />
              ))}
              {/* Event blocks */}
              {dayBlocks[d].map((b, i) => (
                <div
                  key={i}
                  className={`absolute left-1 right-1 rounded ${STATE_CLS[b.state]}`}
                  style={{
                    top:    (b.start - START_MIN) * PX_PER_MIN,
                    height: Math.max(2, (b.end - b.start) * PX_PER_MIN - 1),
                  }}
                  title={`${formatMin(b.start)}–${formatMin(b.end)}`}
                />
              ))}
            </div>
          ))}
        </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-500 flex-wrap">
        <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${STATE_CLS.free}`} /> Available</span>
        <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${STATE_CLS.office}`} /> Office hour</span>
        <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${STATE_CLS.booked}`} /> Other section</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-beige-200 bg-white" /> Outside teaching hrs</span>
        <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${STATE_CLS['proposed-good']}`} /> Proposed (ok)</span>
        <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${STATE_CLS['proposed-conflict'].split(' ')[0]}`} /> Proposed (conflict)</span>
      </div>

      {proposedRange && (
        <p className="mt-2 text-xs text-stone-500">
          The bold colored bar shows where <strong className="text-stone-700">your proposed slot</strong> would land.
          Red bordering means it conflicts with something — pick a slot that lands on green (Available).
        </p>
      )}
      {!proposedRange && !noAvailability && (
        <p className="mt-2 text-xs text-stone-500">
          Pick a day + time below — the grid will live-preview where your slot lands.
        </p>
      )}
    </div>
  );
}
