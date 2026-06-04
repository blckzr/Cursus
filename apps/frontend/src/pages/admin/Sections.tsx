import { useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSections, updateSection,
  getTerms, getPrograms, getBlocks, getUsers, getEnrollments,
  autoAssignPreview, autoAssignApply,
  type AutoAssignStrategy,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import DataTable, { type DataTableHeader } from '../../components/DataTable';
import TableSkeleton from '../../components/TableSkeleton';
import CardGridSkeleton from '../../components/CardGridSkeleton';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';
import { parseApiError } from '../../lib/apiError';
import { DAY_ORDER, DAY_LABEL, parseDays, joinDays } from '../../lib/days';
import FacultyScheduleGrid from '../../components/FacultyScheduleGrid';

// Mobile keeps Course, Faculty (so TBA badges stay visible — the main point of this view),
// and the edit button. Schedule / Room / Enrolled collapse below sm/md.
const HEADERS: DataTableHeader[] = [
  { label: 'Course' },
  { label: 'Faculty' },
  { label: 'Schedule', hideBelow: 'sm' },
  { label: 'Room',     hideBelow: 'md' },
  { label: 'Enrolled', align: 'center', hideBelow: 'md' },
  { label: '', align: 'right' },
];

const isActive = (v: unknown) => v === true || v === 'true';

type Level = 'terms' | 'programs' | 'years' | 'blocks' | 'subjects';

export default function Sections() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: sections = [],    isLoading: loadingSecs }   = useQuery({ queryKey: ['sections'],     queryFn: () => getSections() });
  const { data: terms = [],       isLoading: loadingTerms }  = useQuery({ queryKey: ['terms'],        queryFn: () => getTerms() });
  const { data: programs = [],    isLoading: loadingProgs }  = useQuery({ queryKey: ['programs'],     queryFn: () => getPrograms() });
  const { data: blocks = [],      isLoading: loadingBlocks } = useQuery({ queryKey: ['blocks'],       queryFn: () => getBlocks() });
  const { data: faculty = [] }                                 = useQuery({ queryKey: ['users', 'faculty'], queryFn: () => getUsers('faculty') });
  const { data: enrollments = [] }                             = useQuery({ queryKey: ['enrollments'], queryFn: () => getEnrollments() });

  // ── URL-driven drill-down state ───────────────────────────────────────
  const [params, setParams] = useSearchParams();
  const termId        = params.get('term');
  const programId     = params.get('program');
  const yearLevelStr  = params.get('year');
  const blockId       = params.get('block');
  const yearLevel     = yearLevelStr ? Number(yearLevelStr) : null;

  // Resolve to entities — if URL has stale/invalid IDs we treat that level as "not selected".
  const term    = termId    ? terms.find((t: any) => t.id === termId)        : null;
  const program = programId ? programs.find((p: any) => p.id === programId)  : null;
  const block   = blockId   ? blocks.find((b: any) => b.id === blockId)      : null;

  const level: Level = !term     ? 'terms'
                     : !program  ? 'programs'
                     : !yearLevel ? 'years'
                     : !block    ? 'blocks'
                     : 'subjects';

  const goHome    = () => setParams({});
  const goTerm    = (id: string)   => setParams({ term: id });
  const goProgram = (id: string)   => setParams({ term: termId!, program: id });
  const goYear    = (y: number)    => setParams({ term: termId!, program: programId!, year: String(y) });
  const goBlock   = (id: string)   => setParams({ term: termId!, program: programId!, year: yearLevelStr!, block: id });

  // ── Filtered section pools per drill level ────────────────────────────
  const termSections    = useMemo(() => sections.filter((s: any) => s.term_id === termId),                                              [sections, termId]);
  const programSections = useMemo(() => termSections.filter((s: any) => s.program_id === programId),                                    [termSections, programId]);
  const yearSections    = useMemo(() => programSections.filter((s: any) => s.block_year_level === yearLevel),                           [programSections, yearLevel]);
  const blockSections   = useMemo(() => yearSections.filter((s: any) => s.block_id === blockId),                                        [yearSections, blockId]);

  // ── Subjects-level (table) state ──────────────────────────────────────
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ facultyId: '', dayOfWeek: '', startTime: '', endTime: '', room: '' });
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const resetErr = () => { setErr(''); setFieldErrors({}); };
  const [query, setQuery] = useState('');
  const [tbaOnly, setTbaOnly] = useState(false);

  const updateMut = useMutation({
    mutationFn: () => updateSection(editing.id, {
      facultyId: editForm.facultyId || null,
      dayOfWeek: editForm.dayOfWeek || null,
      startTime: editForm.startTime || null,
      endTime:   editForm.endTime   || null,
      room:      editForm.room      || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections'] });
      setEditing(null); resetErr();
      toast.push({ tone: 'success', title: 'Section updated' });
    },
    onError: (e: unknown) => { const p = parseApiError(e, 'Failed to update section'); setErr(p.message); setFieldErrors(p.fields); },
  });

  const enrolledFor = (sectionId: string) =>
    enrollments.filter((e: any) => e.section_id === sectionId && e.status === 'enrolled').length;

  // Final filtered list at the subjects level
  const filteredSubjects = useMemo(() => blockSections.filter((s: any) => {
    if (tbaOnly && s.faculty_id) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${s.course_code} ${s.course_title}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [blockSections, query, tbaOnly]);

  const tbaCount = blockSections.filter((s: any) => !s.faculty_id).length;

  // The auto-assign modal lives on the page header so it's reachable from any
  // drill level once a term has been picked.
  const [showAutoAssign, setShowAutoAssign] = useState(false);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Sections"
        subtitle="Browse by term → program → year → block → courses. Click any card to drill in."
        action={term && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowAutoAssign(true)}
            title="Run the algorithm to propose faculty + schedule for every TBA section in this term"
          >
            <Icon name="sparkles" size={14} />
            <span className="hidden sm:inline">Auto-assign sections</span>
            <span className="sm:hidden">Auto-assign</span>
          </button>
        )}
      />

      {/* Breadcrumb */}
      <Breadcrumb
        level={level} term={term} program={program} yearLevel={yearLevel} block={block}
        goHome={goHome} goTerm={() => goTerm(termId!)} goProgram={() => goProgram(programId!)}
        goYear={() => goYear(yearLevel!)}
      />

      {showAutoAssign && term && (
        <AutoAssignModal
          term={term}
          onClose={() => setShowAutoAssign(false)}
          onApplied={() => {
            qc.invalidateQueries({ queryKey: ['sections'] });
            setShowAutoAssign(false);
          }}
        />
      )}

      {/* Level content */}
      {level === 'terms' && (
        <TermsView
          terms={terms} sections={sections} loading={loadingTerms || loadingSecs}
          onPick={goTerm}
        />
      )}

      {level === 'programs' && term && (
        <ProgramsView
          programs={programs} sections={termSections} loading={loadingProgs}
          onPick={goProgram}
        />
      )}

      {level === 'years' && program && (
        <YearsView
          program={program} sections={programSections} blocks={blocks}
          onPick={goYear}
        />
      )}

      {level === 'blocks' && program && yearLevel && (
        <BlocksView
          blocks={blocks} program={program} yearLevel={yearLevel}
          sections={yearSections} loading={loadingBlocks}
          onPick={goBlock}
        />
      )}

      {level === 'subjects' && block && (
        <>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4 md:flex-wrap">
            <SearchInput value={query} onChange={setQuery} placeholder="Search course code or title…" className="w-full md:w-80" />
            <div className="flex items-center justify-between gap-3">
              <Chip active={tbaOnly} onClick={() => setTbaOnly(v => !v)}>
                <Icon name="alert-triangle" size={10} className="text-amber-500" /> TBA only ({tbaCount})
              </Chip>
              <span className="text-xs text-stone-400 md:ml-auto tabular whitespace-nowrap">{filteredSubjects.length} of {blockSections.length}</span>
            </div>
          </div>

          {loadingSecs ? (
            <TableSkeleton headers={HEADERS} rows={6} />
          ) : filteredSubjects.length === 0 ? (
            <div className="card p-0">
              <EmptyState icon="school" title="No sections in this block"
                message="Open the term first to generate sections from the curriculum." />
            </div>
          ) : (
            <DataTable headers={HEADERS} pageSize={10}>
              {filteredSubjects.map((s: any) => {
                const enrolled = enrolledFor(s.id);
                const fillPct  = s.capacity ? (enrolled / s.capacity) * 100 : 0;
                const tba = !s.faculty_id;
                return (
                  <tr key={s.id} className="hover:bg-beige-50 transition-colors">
                    <td className="table-td">
                      <span className="font-mono text-xs text-stone-500 font-semibold">{s.course_code}</span>
                      <span className="ml-2">{s.course_title}</span>
                    </td>
                    <td className="table-td text-xs">
                      {s.faculty_name
                        ? <span className="text-stone-700">{s.faculty_name}</span>
                        : <span className="badge badge-amber"><Icon name="alert-triangle" size={10} /> TBA</span>}
                    </td>
                    <td className="table-td text-xs hidden sm:table-cell">
                      {s.day_of_week
                        ? <><span className="font-mono">{s.day_of_week}</span> {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</>
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="table-td text-stone-500 text-xs hidden md:table-cell">{s.room ?? <span className="text-stone-300">—</span>}</td>
                    <td className="table-td hidden md:table-cell">
                      <div className="flex items-center gap-2 justify-center">
                        <span className="tabular text-xs font-semibold text-stone-700 w-12 text-right">{enrolled}/{s.capacity}</span>
                        <div className="w-16 h-1.5 bg-beige-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${fillPct >= 90 ? 'bg-red-400' : fillPct >= 70 ? 'bg-khaki-400' : 'bg-olive-300'}`}
                            style={{ width: `${Math.min(100, fillPct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-right">
                      <button className={`btn-icon ml-auto ${tba ? 'text-amber-600' : ''}`}
                        title={tba ? 'Assign faculty + schedule' : 'Edit'}
                        onClick={() => {
                          setEditing(s);
                          setEditForm({
                            facultyId: s.faculty_id ?? '',
                            dayOfWeek: s.day_of_week ?? '',
                            startTime: (s.start_time ?? '').slice(0, 5),
                            endTime:   (s.end_time   ?? '').slice(0, 5),
                            room:      s.room ?? '',
                          });
                          resetErr();
                        }}>
                        <Icon name="pencil" size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={editing.block_label + ' · ' + editing.course_code}
          subtitle={editing.course_title}
          onClose={() => { setEditing(null); resetErr(); }} size="lg">
          <div className="space-y-3">
            <SelectField label="Faculty" value={editForm.facultyId}
              onChange={e => setEditForm(f => ({ ...f, facultyId: e.target.value }))} error={fieldErrors.facultyId}>
              <option value="">— TBA —</option>
              {faculty.map((f: any) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </SelectField>

            <FacultyScheduleGrid
              facultyId={editForm.facultyId || null}
              termId={editing.term_id}
              excludeSectionId={editing.id}
              proposed={{
                dayOfWeek: editForm.dayOfWeek,
                startTime: editForm.startTime,
                endTime:   editForm.endTime,
              }}
            />

            <div>
              <label className="label">Day(s)</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_ORDER.map(d => {
                  const selected = parseDays(editForm.dayOfWeek);
                  const active = selected.includes(d);
                  return (
                    <button key={d} type="button"
                      className={`chip ${active ? 'active' : ''}`}
                      onClick={() => {
                        const next = active ? selected.filter(x => x !== d) : [...selected, d];
                        setEditForm(f => ({ ...f, dayOfWeek: joinDays(next) }));
                      }}>
                      {DAY_LABEL[d]}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.dayOfWeek && <p className="text-xs text-red-600 mt-1">{fieldErrors.dayOfWeek}</p>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <InputField label="Start time" type="time" value={editForm.startTime}
                onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} error={fieldErrors.startTime} />
              <InputField label="End time" type="time" value={editForm.endTime}
                onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} error={fieldErrors.endTime} />
              <div className="col-span-2 sm:col-span-1">
                <InputField label="Room" value={editForm.room}
                  onChange={e => setEditForm(f => ({ ...f, room: e.target.value }))}
                  placeholder="Room 201" error={fieldErrors.room} />
              </div>
            </div>
            {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditing(null); resetErr(); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { resetErr(); updateMut.mutate(); }} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================

function Breadcrumb({
  level, term, program, yearLevel, block, goHome, goTerm, goProgram, goYear,
}: {
  level: Level;
  term: any; program: any; yearLevel: number | null; block: any;
  goHome: () => void; goTerm: () => void; goProgram: () => void; goYear: () => void;
}) {
  const items: { label: string; onClick?: () => void; active?: boolean }[] = [
    { label: 'All terms', onClick: goHome, active: level === 'terms' },
  ];
  if (term)      items.push({ label: term.name,            onClick: goTerm,    active: level === 'programs' });
  if (program)   items.push({ label: program.code,         onClick: goProgram, active: level === 'years'    });
  if (yearLevel) items.push({ label: `Year ${yearLevel}`,  onClick: goYear,    active: level === 'blocks'   });
  if (block)     items.push({ label: `Block ${yearLevel}-${block.block_number}`, active: true });

  return (
    <nav className="flex items-center gap-1.5 text-sm mb-5 flex-wrap">
      <Icon name="home" size={14} className="text-stone-400" />
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <Icon name="chevron-right" size={11} className="text-stone-300" />}
          {it.onClick && !it.active ? (
            <button onClick={it.onClick} className="text-olive-500 hover:text-olive-600 hover:underline transition-colors">
              {it.label}
            </button>
          ) : (
            <span className={it.active ? 'text-stone-800 font-medium' : 'text-stone-500'}>{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

// ============================================================================
// Level views
// ============================================================================

function TermsView({ terms, sections, loading, onPick }: {
  terms: any[]; sections: any[]; loading: boolean; onPick: (id: string) => void;
}) {
  const countFor = (termId: string) => sections.filter((s: any) => s.term_id === termId).length;
  if (loading) return <CardGridSkeleton count={4} cols={2} />;
  if (terms.length === 0) {
    return <div className="card p-0"><EmptyState icon="calendar" title="No terms" message="Create a term first from the Terms page." /></div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {terms.map((t: any) => {
        const active = isActive(t.is_active);
        const count = countFor(t.id);
        return (
          <button key={t.id} onClick={() => onPick(t.id)}
            className={`card text-left hover:border-olive-200 hover:shadow-pop transition-all ${active ? 'border-olive-300 ring-1 ring-olive-200' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">
                  {active ? 'Active term' : 'Past term'}
                </div>
                <h3 className="font-medium text-stone-800 mt-0.5">{t.name}</h3>
                <p className="text-xs text-stone-500 mt-1.5">
                  {new Date(t.start_date).toLocaleDateString()} → {new Date(t.end_date).toLocaleDateString()}
                </p>
              </div>
              {active && <span className="badge badge-completed">Current</span>}
            </div>
            <div className="mt-4 pt-3 border-t border-beige-200 flex items-center justify-between">
              <span className="text-sm text-stone-500"><span className="tabular font-semibold text-stone-800">{count}</span> sections</span>
              <Icon name="chevron-right" size={14} className="text-stone-300" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProgramsView({ programs, sections, loading, onPick }: {
  programs: any[]; sections: any[]; loading: boolean; onPick: (id: string) => void;
}) {
  if (loading) return <CardGridSkeleton count={6} cols={3} />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {programs.map((p: any) => {
        const count = sections.filter((s: any) => s.program_id === p.id).length;
        return (
          <button key={p.id} onClick={() => onPick(p.id)}
            className="card text-left hover:border-olive-200 hover:shadow-pop transition-all">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-xs font-semibold text-olive-500">{p.code}</div>
                <h3 className="font-medium text-stone-800 mt-1 text-sm leading-tight">{p.name}</h3>
              </div>
              <Icon name="graduation-cap" size={18} className="text-khaki-300" />
            </div>
            <div className="mt-4 pt-3 border-t border-beige-200 flex items-center justify-between">
              <span className="text-sm text-stone-500"><span className="tabular font-semibold text-stone-800">{count}</span> sections</span>
              <Icon name="chevron-right" size={14} className="text-stone-300" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function YearsView({ program, sections, blocks, onPick }: {
  program: any; sections: any[]; blocks: any[]; onPick: (y: number) => void;
}) {
  const years = Array.from({ length: program.year_levels }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {years.map(y => {
        const blockCount = blocks.filter((b: any) => b.program_id === program.id && b.year_level === y).length;
        const secCount   = sections.filter((s: any) => s.block_year_level === y).length;
        return (
          <button key={y} onClick={() => onPick(y)}
            className="card text-left hover:border-olive-200 hover:shadow-pop transition-all">
            <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Year level</div>
            <div className="font-display text-3xl font-medium text-stone-800 mt-1 tabular leading-none">{y}</div>
            <div className="mt-4 pt-3 border-t border-beige-200 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-base font-semibold tabular">{blockCount}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">Blocks</div>
              </div>
              <div>
                <div className="text-base font-semibold tabular">{secCount}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">Sections</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BlocksView({ blocks, program, yearLevel, sections, loading, onPick }: {
  blocks: any[]; program: any; yearLevel: number; sections: any[]; loading: boolean;
  onPick: (id: string) => void;
}) {
  if (loading) return <CardGridSkeleton count={3} cols={3} />;
  const myBlocks = blocks
    .filter((b: any) => b.program_id === program.id && b.year_level === yearLevel)
    .sort((a: any, b: any) => a.block_number - b.block_number);

  if (myBlocks.length === 0) {
    return <div className="card p-0"><EmptyState icon="boxes" title="No blocks at this year level" message="Adjust the program's block configuration to generate blocks." /></div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {myBlocks.map((b: any) => {
        const secs = sections.filter((s: any) => s.block_id === b.id);
        const tba = secs.filter((s: any) => !s.faculty_id).length;
        return (
          <button key={b.id} onClick={() => onPick(b.id)}
            className="card text-left hover:border-olive-200 hover:shadow-pop transition-all">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-xs font-semibold text-olive-500">{program.code} {b.year_level}-{b.block_number}</div>
                <h3 className="font-medium text-stone-800 mt-1 text-sm">Block {b.year_level}-{b.block_number}</h3>
              </div>
              {tba > 0 && <span className="badge badge-amber"><Icon name="alert-triangle" size={10} /> {tba} TBA</span>}
            </div>
            <div className="mt-4 pt-3 border-t border-beige-200 grid grid-cols-3 gap-2 text-center">
              <div><div className="text-base font-semibold tabular">{b.student_count}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Students</div></div>
              <div><div className="text-base font-semibold tabular">{secs.length}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">Sections</div></div>
              <div><div className={`text-base font-semibold tabular ${tba > 0 ? 'text-amber-600' : ''}`}>{tba}</div><div className="text-[10px] text-stone-400 uppercase tracking-wider">TBA</div></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Auto-assign modal
// ============================================================================

const STRATEGY_LABEL: Record<AutoAssignStrategy, { label: string; hint: string }> = {
  'balanced':            { label: 'Balanced',            hint: 'Even load · honour preferences' },
  'prefer-grouped-days': { label: 'Prefer MWF / TTh',    hint: 'Group sessions onto grouped day blocks' },
  'prefer-mornings':     { label: 'Prefer mornings',     hint: 'Favour AM start times over PM' },
};

function AutoAssignModal({ term, onClose, onApplied }: {
  term: any;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [strategy, setStrategy] = useState<AutoAssignStrategy>('balanced');
  const [onlyTba, setOnlyTba] = useState(true);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof autoAssignPreview>> | null>(null);

  const previewMut = useMutation({
    mutationFn: () => autoAssignPreview({ termId: term.id, strategy, onlyTba }),
    onSuccess:  res => setPreview(res),
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Preview failed', message: parseApiError(e).message }),
  });

  const applyMut = useMutation({
    mutationFn: () => autoAssignApply(preview!.proposals.filter(p => p.facultyId)),
    onSuccess:  (res) => {
      toast.push({
        tone: 'success',
        title: 'Auto-assign applied',
        message: `${res.applied} section${res.applied === 1 ? '' : 's'} updated${res.skipped > 0 ? ` · ${res.skipped} skipped` : ''}.`,
      });
      onApplied();
    },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Apply failed', message: parseApiError(e).message }),
  });

  return (
    <Modal
      title={`Auto-assign sections — ${term.name}`}
      subtitle="Pick a strategy, preview the proposal, then apply. The algorithm respects qualifications, availability, and load caps."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {/* ── Strategy + options ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Strategy</label>
            <div className="space-y-1.5">
              {(Object.keys(STRATEGY_LABEL) as AutoAssignStrategy[]).map(s => (
                <label key={s} className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  strategy === s ? 'border-olive-300 bg-olive-50' : 'border-beige-200 hover:bg-beige-50'
                }`}>
                  <input type="radio" name="strategy" checked={strategy === s}
                    onChange={() => setStrategy(s)} className="mt-1" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">{STRATEGY_LABEL[s].label}</div>
                    <div className="text-[11px] text-stone-500">{STRATEGY_LABEL[s].hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Scope</label>
            <label className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
              onlyTba ? 'border-olive-300 bg-olive-50' : 'border-beige-200 hover:bg-beige-50'
            }`}>
              <input type="checkbox" checked={onlyTba} onChange={e => setOnlyTba(e.target.checked)} className="mt-1" />
              <div>
                <div className="text-sm font-medium text-stone-800">Only TBA sections</div>
                <div className="text-[11px] text-stone-500">When checked, sections that already have a faculty are left untouched.</div>
              </div>
            </label>
            <div className="bg-beige-100 rounded-lg px-3 py-2.5 text-xs text-stone-600 mt-3 flex items-start gap-2">
              <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
              <span>The algorithm reads faculty qualifications, availability, and the per-faculty load cap. Faculty without availability data are skipped.</span>
            </div>
          </div>
        </div>

        {/* ── Preview action ─────────────────────────────────────────── */}
        {!preview && (
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex items-center gap-2"
              onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
              {previewMut.isPending ? <><span className="spinner" /> Running…</> : <><Icon name="sparkles" size={14} /> Preview</>}
            </button>
          </div>
        )}

        {/* ── Preview result ────────────────────────────────────────── */}
        {preview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Sections" value={preview.summary.total} />
              <Stat label="Filled"   value={preview.summary.filled}    tone="olive" />
              <Stat label="Unfilled" value={preview.summary.unfilled}  tone={preview.summary.unfilled > 0 ? 'red' : undefined} />
              <Stat label="Faculty used" value={preview.summary.facultyUsed} />
            </div>

            <div className="border border-beige-200 rounded-lg max-h-[400px] overflow-y-auto scrollable">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-beige-50 z-10">
                  <tr>
                    <th className="table-th !py-2">Section</th>
                    <th className="table-th !py-2 hidden sm:table-cell">Faculty</th>
                    <th className="table-th !py-2 hidden md:table-cell">Schedule</th>
                    <th className="table-th !py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.proposals.map(p => (
                    <tr key={p.sectionId} className={p.facultyId ? '' : 'bg-red-50/40'}>
                      <td className="table-td !py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-olive-600">{p.courseCode}</span>
                          <span className="text-stone-700 truncate">{p.courseTitle}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          {p.blockLabel} · {p.units}u
                        </div>
                      </td>
                      <td className="table-td !py-2 hidden sm:table-cell text-stone-700">
                        {p.facultyName ?? <span className="text-stone-300 italic">—</span>}
                      </td>
                      <td className="table-td !py-2 hidden md:table-cell text-stone-700 whitespace-nowrap">
                        {p.dayOfWeek
                          ? <><span className="font-mono">{p.dayOfWeek}</span> {p.startTime}–{p.endTime}</>
                          : <span className="text-stone-300 italic">—</span>}
                      </td>
                      <td className="table-td !py-2 text-right">
                        {p.facultyId ? (
                          <span className="badge badge-completed text-[10px]" title={p.reason}>
                            <Icon name="check" size={10} /> {p.score}
                          </span>
                        ) : (
                          <span className="badge badge-dropped text-[10px]" title={p.reason}>
                            <Icon name="alert-triangle" size={10} /> Skipped
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.summary.unfilled > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
                <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  {preview.summary.unfilled} section{preview.summary.unfilled === 1 ? '' : 's'} couldn't be filled.
                  Hover the "Skipped" badge for the reason. Try a different strategy, add more qualifications,
                  or expand faculty availability.
                </span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setPreview(null)}>Try another</button>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary flex items-center gap-2"
                onClick={() => applyMut.mutate()}
                disabled={applyMut.isPending || preview.summary.filled === 0}>
                {applyMut.isPending
                  ? <><span className="spinner" /> Applying…</>
                  : <><Icon name="check" size={14} /> Apply {preview.summary.filled} assignment{preview.summary.filled === 1 ? '' : 's'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'olive' | 'red' }) {
  const color = tone === 'olive' ? 'text-olive-500' : tone === 'red' ? 'text-red-500' : 'text-stone-800';
  return (
    <div className="card text-center !py-3">
      <div className={`text-2xl font-display tabular font-medium ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 mt-1">{label}</div>
    </div>
  );
}
