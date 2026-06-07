import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWishlistTerms, getWishlistCandidates, getMyWishlist,
  addToWishlist, removeFromWishlist, updateWishlistEntry,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { SelectField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

interface Term {
  id: string;
  name: string;
  semester: '1' | '2' | 'summer';
  start_date: string;
  end_date: string;
}
interface Candidate {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  units: number;
  yearLevel: number;
  locked: boolean;
  blockedBy: string[];
  isBlockSlot: boolean;
  onWishlist: boolean;
}
interface WishlistEntry {
  id: string;
  term_id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  units: number;
  priority: number;
  notes: string | null;
  created_at: string;
}

const SEM_LABEL: Record<string, string> = {
  '1':    '1st Semester',
  '2':    '2nd Semester',
  summer: 'Summer Term',
};

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Must have',
  2: 'High',
  3: 'Normal',
  4: 'Low',
  5: 'Nice to have',
};

export default function StudentWishlist() {
  const qc    = useQueryClient();
  const toast = useToast();

  // ── Term selection ─────────────────────────────────────────────────────
  const { data: terms = [], isLoading: termsLoading } = useQuery<Term[]>({
    queryKey: ['wishlist-terms'],
    queryFn:  getWishlistTerms,
  });
  const [termId, setTermId] = useState<string>('');
  // Default to the first (= soonest) term.
  useEffect(() => {
    if (!termId && terms.length > 0) setTermId(terms[0].id);
  }, [terms, termId]);

  const term = terms.find(t => t.id === termId);

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: candidates = [], isLoading: candLoading } = useQuery<Candidate[]>({
    queryKey: ['wishlist-candidates', termId],
    queryFn:  () => getWishlistCandidates(termId),
    enabled:  !!termId,
  });
  const { data: entries = [] } = useQuery<WishlistEntry[]>({
    queryKey: ['wishlist-me', termId],
    queryFn:  () => getMyWishlist(termId),
    enabled:  !!termId,
  });

  // ── Local UI state ─────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'locked' | 'wished'>('all');

  // ── Mutations — invalidate both queries on each success ────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wishlist-candidates', termId] });
    qc.invalidateQueries({ queryKey: ['wishlist-me',         termId] });
  };
  const addMut = useMutation({
    mutationFn: (courseId: string) => addToWishlist({ termId, courseId }),
    onSuccess:  () => { invalidate(); toast.push({ tone: 'success', title: 'Added to wishlist' }); },
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not add', message: parseApiError(e).message }),
  });
  const removeMut = useMutation({
    mutationFn: (entryId: string) => removeFromWishlist(entryId),
    onSuccess:  () => { invalidate(); toast.push({ tone: 'info', title: 'Removed from wishlist' }); },
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not remove', message: parseApiError(e).message }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; priority?: number; notes?: string | null }) =>
      updateWishlistEntry(id, data),
    onSuccess:  () => invalidate(),
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not save', message: parseApiError(e).message }),
  });

  // ── Derived data ───────────────────────────────────────────────────────
  const entryByCourse = useMemo(() => {
    const m = new Map<string, WishlistEntry>();
    for (const e of entries) m.set(e.course_id, e);
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (filter === 'available' && (c.locked || c.onWishlist)) return false;
      if (filter === 'locked'    && !c.locked)                  return false;
      if (filter === 'wished'    && !c.onWishlist)              return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${c.courseCode} ${c.courseTitle}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [candidates, filter, query]);

  // ── Summary numbers for the stats bar ─────────────────────────────────
  const totalWishedUnits = entries.reduce((s, e) => s + Number(e.units || 0), 0);
  const counts = {
    available: candidates.filter(c => !c.locked && !c.onWishlist).length,
    locked:    candidates.filter(c =>  c.locked).length,
    wished:    candidates.filter(c =>  c.onWishlist).length,
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (termsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 rounded-xl mt-5" />
        <Skeleton className="h-64 rounded-xl mt-3" />
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Pre-registration"
          title="Course wishlist"
          subtitle="Tell the registrar which subjects you intend to take next term."
        />
        <div className="card p-0">
          <EmptyState
            icon="inbox"
            title="No upcoming terms"
            message="The registrar hasn't scheduled the next term yet. Check back later."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Pre-registration"
        title="Course wishlist"
        subtitle={
          <span>
            Mark the subjects you intend to take next term. The registrar uses this to decide how many sections to open.
          </span>
        }
        stats={[
          { label: 'On your wishlist', value: counts.wished, icon: 'star', tone: 'olive' },
          { label: 'Units wished',     value: totalWishedUnits, icon: 'book-open' },
          { label: 'Available',        value: counts.available, icon: 'check' },
          { label: 'Locked (prereq)',  value: counts.locked, icon: 'alert-triangle', tone: counts.locked > 0 ? 'amber' : 'olive' },
        ]}
      />

      {/* Term selector */}
      <div className="card mb-4 !py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Target term</div>
            {term && (
              <div className="mt-1 text-sm font-medium text-stone-800 truncate">
                {term.name} <span className="text-stone-400 font-normal">· {SEM_LABEL[term.semester]}</span>
                <span className="text-xs text-stone-500 ml-2 hidden sm:inline">
                  ({new Date(term.start_date).toLocaleDateString()} – {new Date(term.end_date).toLocaleDateString()})
                </span>
              </div>
            )}
          </div>
          {terms.length > 1 && (
            <div className="w-full sm:w-64">
              <SelectField label="" value={termId} onChange={e => setTermId(e.target.value)}>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {SEM_LABEL[t.semester]}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
        </div>
      </div>

      {/* Wishlist summary (only renders when there are entries) */}
      {entries.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Your wishlist for {term?.name}</h3>
            <span className="text-xs text-stone-400 tabular">{entries.length} course{entries.length === 1 ? '' : 's'} · {totalWishedUnits} units</span>
          </div>
          <ul className="space-y-1.5">
            {entries.map(e => (
              <li key={e.id} className="flex items-center gap-3 px-2 py-2 rounded bg-beige-50">
                <span className="font-mono text-xs font-semibold text-olive-600 w-20 flex-shrink-0">{e.course_code}</span>
                <span className="flex-1 min-w-0 text-sm text-stone-700 truncate" title={e.course_title}>{e.course_title}</span>
                <span className="text-[10px] text-stone-400 tabular flex-shrink-0">{e.units}u</span>
                {/* Priority dropdown — inline edit */}
                <select
                  value={e.priority}
                  onChange={ev => updateMut.mutate({ id: e.id, priority: Number(ev.target.value) })}
                  className="text-xs bg-white border border-beige-200 rounded px-1.5 py-0.5 text-stone-700 cursor-pointer flex-shrink-0"
                  title="Priority"
                >
                  {[1, 2, 3, 4, 5].map(p => (
                    <option key={p} value={p}>{p} — {PRIORITY_LABEL[p]}</option>
                  ))}
                </select>
                <button
                  className="btn-icon hover:!text-red-500 flex-shrink-0"
                  onClick={() => removeMut.mutate(e.id)}
                  disabled={removeMut.isPending}
                  title="Remove"
                >
                  <Icon name="x" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Browse / add picker */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3 md:flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search code or title…" className="w-full md:w-72" />
        <div className="-mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto scrollable">
          <div className="flex items-center gap-1.5 w-max md:w-auto">
            <Chip active={filter === 'all'}       onClick={() => setFilter('all')}>All ({candidates.length})</Chip>
            <Chip active={filter === 'available'} onClick={() => setFilter('available')}>Available ({counts.available})</Chip>
            <Chip active={filter === 'wished'}    onClick={() => setFilter('wished')}>On wishlist ({counts.wished})</Chip>
            <Chip active={filter === 'locked'}    onClick={() => setFilter('locked')}>Locked ({counts.locked})</Chip>
          </div>
        </div>
        <span className="text-xs text-stone-400 md:ml-auto tabular whitespace-nowrap">{filtered.length} of {candidates.length}</span>
      </div>

      {candLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="book-open"
            title="No courses match"
            message={candidates.length === 0
              ? "There are no curriculum courses left for this term — you may already be enrolled in or have completed everything."
              : "Try a different filter or clear the search."}
          />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <ul className="divide-y divide-beige-200">
            {filtered.map(c => {
              const entry = entryByCourse.get(c.courseId);
              const onWishlist = !!entry;
              return (
                <li key={c.courseId} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-beige-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    onWishlist  ? 'bg-olive-100 text-olive-600'
                    : c.locked  ? 'bg-amber-50  text-amber-600'
                    :              'bg-beige-100 text-stone-500'
                  }`}>
                    <Icon
                      name={onWishlist ? 'star' : c.locked ? 'alert-triangle' : 'plus'}
                      size={15}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-olive-600">{c.courseCode}</span>
                      <span className="font-medium text-stone-800 text-sm truncate">{c.courseTitle}</span>
                      {c.isBlockSlot && (
                        <span className="badge badge-completed text-[10px]">Your year</span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="tabular">{c.units} units · Year {c.yearLevel}</span>
                      {c.locked && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <Icon name="alert-triangle" size={10} />
                          Needs {c.blockedBy.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {onWishlist ? (
                      <button
                        className="btn-ghost text-xs border border-olive-200 text-olive-600 hover:bg-olive-50 flex items-center gap-1.5"
                        onClick={() => removeMut.mutate(entry!.id)}
                        disabled={removeMut.isPending}
                      >
                        <Icon name="check" size={12} />
                        <span className="hidden sm:inline">On wishlist</span>
                      </button>
                    ) : (
                      <button
                        className="btn-secondary text-xs flex items-center gap-1.5"
                        onClick={() => addMut.mutate(c.courseId)}
                        disabled={addMut.isPending}
                        title={c.locked ? 'You can still wishlist this — prereqs are a heads-up, not a block.' : undefined}
                      >
                        <Icon name="plus" size={12} />
                        Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-1.5">
              <Icon name="info" size={12} />
              The wishlist locks automatically once the registrar opens this term.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
