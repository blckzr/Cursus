import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrograms, getCourses, getCurriculum, addCurriculumEntry, removeCurriculumEntry } from '../../api';
import PageHeader from '../../components/PageHeader';
import SectionTitle from '../../components/SectionTitle';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';

type Semester = '1' | '2' | 'summer';
const SEM_ORDER: Semester[] = ['1', '2', 'summer'];
const SEM_LABEL: Record<Semester, string> = { '1': '1st Semester', '2': '2nd Semester', summer: 'Summer' };

export default function Curriculum() {
  const qc = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: () => getPrograms() });

  // The program currently being edited; default to the URL query or the first program in the list.
  const [programId, setProgramId] = useState<string>(searchParams.get('programId') || '');
  useEffect(() => {
    if (!programId && programs.length > 0) setProgramId(programs[0].id);
  }, [programs, programId]);
  useEffect(() => {
    if (programId) setSearchParams({ programId }, { replace: true });
  }, [programId, setSearchParams]);

  const program = programs.find((p: any) => p.id === programId);
  const yearLevels = program?.year_levels ?? 4;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['curriculum', programId],
    queryFn: () => getCurriculum(programId),
    enabled: !!programId,
  });

  // Group entries by year → semester for display.
  const grouped = useMemo(() => {
    const m: Record<number, Record<Semester, any[]>> = {};
    for (let y = 1; y <= yearLevels; y++) m[y] = { '1': [], '2': [], summer: [] };
    for (const e of entries as any[]) {
      const y = e.year_level as number;
      const s = e.semester as Semester;
      if (!m[y]) m[y] = { '1': [], '2': [], summer: [] };
      m[y][s].push(e);
    }
    return m;
  }, [entries, yearLevels]);

  const [picker, setPicker] = useState<null | { yearLevel: number; semester: Semester }>(null);

  // Total units per year + overall.
  const yearTotals = useMemo(() => {
    const t: Record<number, number> = {};
    for (let y = 1; y <= yearLevels; y++) {
      t[y] = SEM_ORDER.reduce((sum, s) => sum + grouped[y][s].reduce((u, e) => u + Number(e.units), 0), 0);
    }
    return t;
  }, [grouped, yearLevels]);
  const overallTotal = Object.values(yearTotals).reduce((a, b) => a + b, 0);

  const removeMut = useMutation({
    mutationFn: (entryId: string) => removeCurriculumEntry(programId, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['curriculum', programId] });
      toast.push({ tone: 'info', title: 'Course removed' });
    },
    onError: (e: unknown) => toast.push({
      tone: 'error', title: 'Could not remove',
      message: parseApiError(e).message,
    }),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Curriculum builder"
        subtitle="Lay out each program's courses by year and semester. Prerequisites are enforced — a course can't be placed before its prereq slot."
        action={
          <SelectField label="" value={programId} onChange={e => setProgramId(e.target.value)}>
            {programs.length === 0 && <option value="">Loading…</option>}
            {programs.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </SelectField>
        }
      />

      {!programId ? (
        <div className="card p-0"><EmptyState icon="graduation-cap" title="Select a program" message="Choose a program above to view or edit its curriculum." /></div>
      ) : isLoading ? (
        <div className="space-y-4">{[0, 1].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-5 text-sm text-stone-600">
            <span><span className="text-stone-400">Overall:</span> <span className="font-semibold tabular">{overallTotal}</span> units</span>
            <span className="text-stone-300">·</span>
            <span><span className="text-stone-400">Program total:</span> <span className="font-semibold tabular">{program?.total_units}</span> units</span>
            {overallTotal !== program?.total_units && (
              <span className="badge badge-amber"><Icon name="alert-triangle" size={10} /> mismatch</span>
            )}
          </div>

          <div className="space-y-6">
            {Array.from({ length: yearLevels }, (_, i) => i + 1).map(year => (
              <section key={year} className="card !p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-beige-50 border-b border-beige-200">
                  <h2 className="text-base font-semibold text-stone-800">Year {year}</h2>
                  <span className="text-xs text-stone-500 tabular">{yearTotals[year]} units</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-beige-200">
                  {SEM_ORDER.map(sem => {
                    const items = grouped[year][sem];
                    const semUnits = items.reduce((s, e) => s + Number(e.units), 0);
                    return (
                      <div key={sem} className="p-3 min-h-[140px]">
                        <SectionTitle title={SEM_LABEL[sem]} tag={`${items.length} · ${semUnits}u`}
                          action={
                            <button className="text-xs text-olive-400 hover:text-olive-600 font-medium flex items-center gap-1"
                              onClick={() => setPicker({ yearLevel: year, semester: sem })}>
                              <Icon name="plus" size={11} /> Add
                            </button>
                          }
                        />
                        {items.length === 0 ? (
                          <p className="text-xs text-stone-400 italic">No courses placed.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {items.map(e => (
                              <li key={e.id} className="group flex items-center gap-2 bg-beige-50 rounded-lg px-2 py-1.5">
                                <span className="font-mono text-xs font-semibold text-olive-600 w-20 flex-shrink-0">{e.code}</span>
                                <span className="text-xs text-stone-700 flex-1 truncate" title={e.title}>{e.title}</span>
                                <span className="text-[10px] text-stone-400 tabular">{e.units}u</span>
                                <button className="btn-icon !w-6 !h-6 opacity-0 group-hover:opacity-100 hover:!text-red-500"
                                  title={`Remove ${e.code}`}
                                  onClick={() => { if (window.confirm(`Remove ${e.code} from this curriculum?`)) removeMut.mutate(e.id); }}>
                                  <Icon name="x" size={10} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {picker && (
        <CoursePickerModal
          programId={programId}
          yearLevel={picker.yearLevel}
          semester={picker.semester}
          placedCourseIds={new Set((entries as any[]).map(e => e.course_id))}
          onClose={() => setPicker(null)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ['curriculum', programId] });
            setPicker(null);
            toast.push({ tone: 'success', title: 'Course added to curriculum' });
          }}
        />
      )}
    </div>
  );
}

// ============================================================================

function CoursePickerModal({ programId, yearLevel, semester, placedCourseIds, onClose, onAdded }: {
  programId: string; yearLevel: number; semester: Semester;
  placedCourseIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  // Courses visible to this program (public + restricted-to-this-program)
  const { data: available = [] } = useQuery({
    queryKey: ['courses', programId],
    queryFn: () => getCourses(programId),
  });
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');

  const filtered = useMemo(() => (available as any[]).filter(c => {
    if (placedCourseIds.has(c.id)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
  }), [available, placedCourseIds, query]);

  const addMut = useMutation({
    mutationFn: () => addCurriculumEntry(programId, { courseId: selectedId, yearLevel, semester }),
    onSuccess: () => onAdded(),
    onError: (e: unknown) => setErr(parseApiError(e).message),
  });

  return (
    <Modal
      title="Add course to curriculum"
      subtitle={`Year ${yearLevel} · ${SEM_LABEL[semester]}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        <input
          type="search"
          className="input"
          placeholder="Search code or title…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />

        <div className="border border-khaki-200 rounded-lg max-h-80 overflow-y-auto scrollable divide-y divide-beige-200">
          {filtered.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">
              {available.length === 0 ? 'No courses available.' : 'All matching courses are already placed.'}
            </p>
          ) : filtered.map(c => (
            <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-beige-50 ${selectedId === c.id ? 'bg-olive-50' : ''}`}>
              <input type="radio" name="course" checked={selectedId === c.id} onChange={() => setSelectedId(c.id)} />
              <span className="font-mono text-xs font-semibold text-olive-600 w-24">{c.code}</span>
              <span className="text-sm text-stone-800 flex-1 truncate">{c.title}</span>
              <span className="text-[10px] text-stone-400 tabular">{c.units}u</span>
              <span className={c.visibility === 'public' ? 'badge badge-enrolled' : 'badge badge-faculty'}>
                {c.visibility === 'public' ? 'Public' : 'Restricted'}
              </span>
            </label>
          ))}
        </div>

        {err && (
          <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { setErr(''); addMut.mutate(); }} disabled={!selectedId || addMut.isPending}>
            {addMut.isPending ? 'Adding…' : 'Add to curriculum'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
