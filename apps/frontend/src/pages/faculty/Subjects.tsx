import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCourses, getQualifications,
  addQualification, updateQualification, removeQualification,
  replaceQualifications,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import { InputField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

interface Course {
  id: string; code: string; title: string; units: number;
  visibility: 'public' | 'restricted';
}
interface QualItem {
  id: string; course_id: string; preference: number; notes: string | null;
  code: string; title: string; units: number;
}

const PREF_LABEL: Record<number, string> = {
  1: 'Love it',
  2: 'Strong',
  3: 'Normal',
  4: 'Backup',
  5: 'Pinch hitter',
};
const PREF_TINT: Record<number, string> = {
  1: 'bg-olive-100 text-olive-700',
  2: 'bg-olive-50  text-olive-600',
  3: 'bg-beige-100 text-stone-600',
  4: 'bg-khaki-50  text-khaki-600',
  5: 'bg-amber-50  text-amber-600',
};

export default function FacultySubjects() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const facultyId = user!.id;

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: prefs, isLoading: prefsLoading } = useQuery<{
    facultyId: string; fullName: string; maxTeachingUnits: number | null; items: QualItem[];
  }>({
    queryKey: ['qualifications', facultyId],
    queryFn:  () => getQualifications(facultyId),
  });
  const { data: courses = [], isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ['courses'],
    queryFn:  () => getCourses(),
  });

  const qualifiedByCourseId = useMemo(() => {
    const m = new Map<string, QualItem>();
    for (const it of (prefs?.items ?? [])) m.set(it.course_id, it);
    return m;
  }, [prefs]);

  // ── Local state ────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'available'>('mine');
  // Editable cap that's debounced-saved when blurred / Enter.
  const [maxUnitsDraft, setMaxUnitsDraft] = useState<string>('');
  const maxUnitsServerValue = prefs?.maxTeachingUnits;
  // Sync draft when the server value finishes loading.
  useMemo(() => {
    if (maxUnitsServerValue !== undefined) {
      setMaxUnitsDraft(maxUnitsServerValue == null ? '' : String(maxUnitsServerValue));
    }
  }, [maxUnitsServerValue]);
  const capDirty = maxUnitsDraft !== (maxUnitsServerValue == null ? '' : String(maxUnitsServerValue));

  // ── Mutations ──────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ['qualifications', facultyId] });

  const addMut = useMutation({
    mutationFn: (courseId: string) => addQualification(facultyId, { courseId, preference: 3 }),
    onSuccess:  () => { invalidate(); toast.push({ tone: 'success', title: 'Added to your subjects' }); },
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not add', message: parseApiError(e).message }),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeQualification(facultyId, id),
    onSuccess:  () => { invalidate(); toast.push({ tone: 'info', title: 'Removed' }); },
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not remove', message: parseApiError(e).message }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; preference?: number; notes?: string | null }) =>
      updateQualification(facultyId, id, data),
    onSuccess:  () => invalidate(),
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not save', message: parseApiError(e).message }),
  });
  const capMut = useMutation({
    mutationFn: () => replaceQualifications(facultyId, {
      maxTeachingUnits: maxUnitsDraft.trim() === '' ? null : Number(maxUnitsDraft),
      items: (prefs?.items ?? []).map(i => ({ courseId: i.course_id, preference: i.preference, notes: i.notes ?? undefined })),
    }),
    onSuccess: () => { invalidate(); toast.push({ tone: 'success', title: 'Load cap saved' }); },
    onError:   (e: unknown) => toast.push({ tone: 'error', title: 'Could not save cap', message: parseApiError(e).message }),
  });

  // ── Derived view ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return courses.filter(c => {
      const mine = qualifiedByCourseId.has(c.id);
      if (filter === 'mine'      && !mine) return false;
      if (filter === 'available' && mine)  return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${c.code} ${c.title}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [courses, qualifiedByCourseId, filter, query]);

  const myUnitTotal = (prefs?.items ?? []).reduce((s, i) => s + Number(i.units || 0), 0);
  const lovedCount  = (prefs?.items ?? []).filter(i => i.preference <= 2).length;

  if (prefsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 rounded-xl mt-5" />
        <Skeleton className="h-64 rounded-xl mt-3" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Teaching preferences"
        title="My subjects"
        subtitle="Mark the courses you can teach and how strongly you prefer each one. The admin uses this when assigning faculty to sections."
        stats={[
          { label: 'Qualified subjects', value: prefs?.items?.length ?? 0, icon: 'book-open', tone: 'olive' },
          { label: 'Strong preferences', value: lovedCount, icon: 'star', tone: 'olive' },
          { label: 'Units (if assigned all)', value: myUnitTotal, icon: 'clock' },
          { label: 'Max load / week',    value: prefs?.maxTeachingUnits ?? '—', icon: 'shield' },
        ]}
      />

      {/* Load cap editor */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <InputField
              label="Maximum teaching units per week"
              type="number"
              min="0"
              max="60"
              value={maxUnitsDraft}
              onChange={e => setMaxUnitsDraft(e.target.value)}
              placeholder="24 (default)"
              hint="Soft cap the auto-assigner respects. Leave blank for no cap."
            />
          </div>
          {capDirty && (
            <button className="btn-primary flex items-center gap-2" onClick={() => capMut.mutate()} disabled={capMut.isPending}>
              {capMut.isPending ? 'Saving…' : 'Save cap'}
            </button>
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3 md:flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search code or title…" className="w-full md:w-72" />
        <div className="-mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto scrollable">
          <div className="flex items-center gap-1.5 w-max md:w-auto">
            <Chip active={filter === 'mine'}      onClick={() => setFilter('mine')}>My subjects ({prefs?.items?.length ?? 0})</Chip>
            <Chip active={filter === 'available'} onClick={() => setFilter('available')}>Add new ({courses.length - (prefs?.items?.length ?? 0)})</Chip>
            <Chip active={filter === 'all'}       onClick={() => setFilter('all')}>All ({courses.length})</Chip>
          </div>
        </div>
        <span className="text-xs text-stone-400 md:ml-auto tabular whitespace-nowrap">{filtered.length} shown</span>
      </div>

      {coursesLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="book-open"
            title={filter === 'mine' ? 'No subjects yet' : 'No courses match'}
            message={filter === 'mine'
              ? 'Switch to "Add new" to qualify yourself for some courses.'
              : 'Try a different filter or clear the search.'}
          />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <ul className="divide-y divide-beige-200">
            {filtered.map(c => {
              const entry = qualifiedByCourseId.get(c.id);
              const onList = !!entry;
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-beige-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    onList ? PREF_TINT[entry!.preference] : 'bg-beige-100 text-stone-500'
                  }`}>
                    <Icon name={onList ? 'star' : 'plus'} size={15} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-olive-600">{c.code}</span>
                      <span className="font-medium text-stone-800 text-sm truncate">{c.title}</span>
                      {c.visibility === 'restricted' && (
                        <span className="badge badge-faculty text-[10px]">Restricted</span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 tabular">{c.units} units</div>
                  </div>

                  {onList ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={entry!.preference}
                        onChange={ev => updateMut.mutate({ id: entry!.id, preference: Number(ev.target.value) })}
                        className="text-xs bg-white border border-beige-200 rounded px-1.5 py-0.5 text-stone-700 cursor-pointer"
                        title="Preference"
                      >
                        {[1, 2, 3, 4, 5].map(p => (
                          <option key={p} value={p}>{p} — {PREF_LABEL[p]}</option>
                        ))}
                      </select>
                      <button
                        className="btn-icon hover:!text-red-500"
                        onClick={() => removeMut.mutate(entry!.id)}
                        disabled={removeMut.isPending}
                        title="Remove"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                      onClick={() => addMut.mutate(c.id)}
                      disabled={addMut.isPending}
                    >
                      <Icon name="plus" size={12} />
                      Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center gap-1.5">
            <Icon name="info" size={12} />
            Preference is the algorithm's tie-breaker, not a guarantee — admins still have final say.
          </div>
        </div>
      )}
    </div>
  );
}
