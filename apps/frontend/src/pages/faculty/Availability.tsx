import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAvailability, saveAvailability } from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';

import { DAY_ORDER, DAY_LABEL, parseDays, joinDays, type DayCode } from '../../lib/days';

interface Slot {
  id?: string;
  dayOfWeek: string;
  startTime: string;
  endTime:   string;
  kind:      'teaching' | 'office_hour';
}

const KIND_LABEL: Record<Slot['kind'], string> = {
  teaching: 'Teaching',
  office_hour: 'Office hour',
};
const KIND_BADGE: Record<Slot['kind'], string> = {
  teaching: 'badge-completed',
  office_hour: 'badge-amber',
};

export default function FacultyAvailability() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: serverSlots = [], isLoading } = useQuery({
    queryKey: ['availability', user?.id],
    queryFn: () => getAvailability(user!.id),
    enabled: !!user,
  });

  // Local working copy — flushed to server only when "Save changes" is clicked.
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      const normalized = (serverSlots as any[]).map(r => ({
        dayOfWeek: r.day_of_week,
        startTime: String(r.start_time).slice(0, 5),
        endTime:   String(r.end_time).slice(0, 5),
        kind:      r.kind,
      }));
      setSlots(normalized);
      setDirty(false);
    }
  }, [serverSlots, isLoading]);

  // New-slot draft (lives inline at the top of the table).
  const [draft, setDraft] = useState<Slot>({ dayOfWeek: '', startTime: '08:00', endTime: '12:00', kind: 'teaching' });

  const saveMut = useMutation({
    mutationFn: () => saveAvailability(user!.id, slots),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', user?.id] });
      setDirty(false);
      toast.push({ tone: 'success', title: 'Availability saved' });
    },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Save failed', message: parseApiError(e).message }),
  });

  const toggleDraftDay = (d: DayCode) => {
    const cur = parseDays(draft.dayOfWeek);
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d];
    setDraft(s => ({ ...s, dayOfWeek: joinDays(next) }));
  };

  const addDraft = () => {
    if (!draft.dayOfWeek || !draft.startTime || !draft.endTime) return;
    if (draft.endTime <= draft.startTime) {
      toast.push({ tone: 'error', title: 'Invalid range', message: 'End time must be after start time.' });
      return;
    }
    setSlots(s => [...s, draft]);
    setDirty(true);
    setDraft({ dayOfWeek: '', startTime: '08:00', endTime: '12:00', kind: 'teaching' });
  };

  const removeSlot = (idx: number) => {
    setSlots(s => s.filter((_, i) => i !== idx));
    setDirty(true);
  };

  // Hour totals for the at-a-glance stats
  const hoursOf = (s: Slot) => {
    const dayCount = parseDays(s.dayOfWeek).length || 0;
    const [h1, m1] = s.startTime.split(':').map(Number);
    const [h2, m2] = s.endTime.split(':').map(Number);
    return dayCount * ((h2 + m2 / 60) - (h1 + m1 / 60));
  };
  const teachingHours = slots.filter(s => s.kind === 'teaching').reduce((sum, s) => sum + hoursOf(s), 0);
  const officeHours   = slots.filter(s => s.kind === 'office_hour').reduce((sum, s) => sum + hoursOf(s), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Schedule"
        title="My availability"
        subtitle="Declare your weekly teaching slots and office hours. The system uses these to validate section assignments."
        stats={[
          { label: 'Teaching hours / week', value: teachingHours.toFixed(1), icon: 'book-open',  tone: 'olive' },
          { label: 'Office hours / week',   value: officeHours.toFixed(1),   icon: 'clock',       tone: 'khaki' },
          { label: 'Total slots',           value: slots.length,             icon: 'calendar',   tone: 'olive' },
        ]}
        action={dirty && (
          <button className="btn-primary flex items-center gap-2" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <><span className="spinner" /> Saving…</> : <>Save changes <Icon name="check" size={14} /></>}
          </button>
        )}
      />

      {/* Add slot form — stacks on mobile, side-by-side from md: up. */}
      <div className="card mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">Add a slot</p>
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 md:gap-4 md:items-end">
          <div className="md:flex-1 md:min-w-[200px]">
            <label className="label">Day(s)</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_ORDER.map(d => {
                const active = parseDays(draft.dayOfWeek).includes(d);
                return (
                  <button key={d} type="button" className={`chip ${active ? 'active' : ''}`} onClick={() => toggleDraftDay(d)}>
                    {DAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:w-44">
            <InputField label="Start" type="time" value={draft.startTime} onChange={e => setDraft(s => ({ ...s, startTime: e.target.value }))} />
            <InputField label="End"   type="time" value={draft.endTime}   onChange={e => setDraft(s => ({ ...s, endTime:   e.target.value }))} />
          </div>
          <div className="md:w-44">
            <SelectField label="Kind" value={draft.kind} onChange={e => setDraft(s => ({ ...s, kind: e.target.value as Slot['kind'] }))}>
              <option value="teaching">Teaching</option>
              <option value="office_hour">Office hour</option>
            </SelectField>
          </div>
          <button className="btn-primary flex items-center justify-center gap-2 w-full md:w-auto" onClick={addDraft}
            disabled={!draft.dayOfWeek || !draft.startTime || !draft.endTime}>
            <Icon name="plus" size={14} /> Add
          </button>
        </div>
      </div>

      {/* Slot list — table scrolls horizontally on mobile so small screens don't squeeze cells. */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : slots.length === 0 ? (
        <div className="card p-0"><EmptyState icon="calendar" title="No availability set"
          message="Add at least one teaching slot above so the admin can assign you to sections." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead><tr>
                <th className="table-th">Day(s)</th>
                <th className="table-th">Time</th>
                <th className="table-th">Kind</th>
                <th className="table-th text-right"></th>
              </tr></thead>
              <tbody>
                {slots.map((s, i) => (
                  <tr key={i} className="hover:bg-beige-50 transition-colors">
                    <td className="table-td font-mono whitespace-nowrap">{s.dayOfWeek}</td>
                    <td className="table-td tabular text-stone-700 whitespace-nowrap">{s.startTime} – {s.endTime}</td>
                    <td className="table-td">
                      <span className={`badge ${KIND_BADGE[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
                    </td>
                    <td className="table-td text-right">
                      <button className="btn-icon hover:!text-red-500" onClick={() => removeSlot(i)} title="Remove">
                        <Icon name="x" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dirty && (
        <div className="mt-4 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 flex items-center gap-2">
          <Icon name="info" size={12} /> You have unsaved changes. Click <strong>Save changes</strong> at the top right.
        </div>
      )}
    </div>
  );
}
