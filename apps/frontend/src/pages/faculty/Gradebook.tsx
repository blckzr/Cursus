import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGradebook, createCategory, createAssessment,
  bulkSaveScores, finalizeGrades, deleteCategory, deleteAssessment,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import SearchInput from '../../components/SearchInput';
import Chip from '../../components/Chip';
import Avatar from '../../components/Avatar';
import Skeleton from '../../components/Skeleton';
import RiskPill from '../../components/RiskPill';
import GradeRing from '../../components/GradeRing';
import ProgressBar from '../../components/ProgressBar';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { InputField, SelectField } from '../../components/FormField';

interface Assessment { id: string; name: string; max_score: number; display_order: number; }
interface Category   { id: string; name: string; weight: number; assessments: Assessment[]; }
interface Student {
  enrollmentId: string;
  studentName: string;
  scores: Record<string, number | null>;
  computedGrade: number | null;
  finalizedGrade: number | null;
  letterGrade: string | null;
}

const cellKey = (eId: string, aId: string) => `${eId}|${aId}`;

const gradeTintForCell = (value: any, max: number) => {
  if (value == null || value === '' || max <= 0) return null;
  const pct = (Number(value) / max) * 100;
  if (pct < 60) return 'bg-red-50';
  if (pct < 75) return 'bg-amber-50';
  return null;
};

const gradeColorForComputed = (g: number | null) => {
  if (g == null) return 'text-stone-400';
  if (g < 75) return 'text-red-500';
  if (g < 80) return 'text-amber-600';
  return 'text-olive-500';
};

/** Approximate PH letter-grade scale for displaying live equivalents. */
function numericToLetter(g: number): string {
  if (g >= 97) return '1.00';
  if (g >= 93) return '1.25';
  if (g >= 90) return '1.50';
  if (g >= 87) return '1.75';
  if (g >= 83) return '2.00';
  if (g >= 80) return '2.25';
  if (g >= 77) return '2.50';
  if (g >= 75) return '2.75';
  if (g >= 65) return '3.00';
  return '5.00';
}

export default function Gradebook() {
  const { id: sectionId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['gradebook', sectionId],
    queryFn: () => getGradebook(sectionId!),
  });

  // Modals + UI state
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showCat, setShowCat] = useState(false);
  const [showAsm, setShowAsm] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [filter, setFilter] = useState<'all' | 'risk' | 'watch' | 'strong'>('all');
  const [query, setQuery] = useState('');

  const section = data?.section as any;
  const categories: Category[] = data?.categories || [];
  const students: Student[] = data?.students || [];
  const allAssessments = useMemo(
    () => categories.flatMap(c => c.assessments.map(a => ({ ...a, categoryName: c.name }))),
    [categories],
  );
  const totalWeight = categories.reduce((s, c) => s + Number(c.weight), 0);

  const cellVal = (student: Student, aId: string) => {
    const k = cellKey(student.enrollmentId, aId);
    if (edits[k] !== undefined) return edits[k];
    const s = student.scores[aId];
    return s == null ? '' : String(s);
  };

  // Live computed grade using edits + server scores
  const computedFor = (student: Student): number | null => {
    let total = 0, weightUsed = 0;
    categories.forEach(c => {
      let earned = 0, max = 0;
      c.assessments.forEach(a => {
        const k = cellKey(student.enrollmentId, a.id);
        let v: number | undefined;
        if (edits[k] !== undefined) {
          if (edits[k] === '') return;
          v = Number(edits[k]);
        } else {
          const s = student.scores[a.id];
          if (s == null) return;
          v = s;
        }
        if (v !== undefined && !isNaN(v)) {
          earned += v;
          max += a.max_score;
        }
      });
      if (max > 0) {
        total += (earned / max) * 100 * (c.weight / 100);
        weightUsed += c.weight;
      }
    });
    if (weightUsed === 0) return null;
    return Math.round((total / (weightUsed / 100)) * 100) / 100;
  };

  // ---- Aggregates -----------------------------------------------------------
  const grades = students.map(computedFor).filter((g): g is number => g != null);
  const classAvg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
  const atRiskCount = students.filter(s => { const g = computedFor(s); return g != null && g < 75; }).length;
  const strongCount = students.filter(s => { const g = computedFor(s); return g != null && g >= 90; }).length;

  // ---- Filter ---------------------------------------------------------------
  const visible = students.filter(s => {
    if (query && !s.studentName.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'all') return true;
    const g = computedFor(s);
    if (filter === 'risk')   return g != null && g < 75;
    if (filter === 'watch')  return g != null && g >= 75 && g < 80;
    if (filter === 'strong') return g != null && g >= 90;
    return true;
  });

  // ---- Mutations ------------------------------------------------------------
  const catMut = useMutation({
    mutationFn: (vals: { name: string; weight: number }) =>
      createCategory(sectionId!, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }); setShowCat(false); toast.push({ tone: 'success', title: 'Category added' }); },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Error', message: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '' }),
  });
  const asmMut = useMutation({
    mutationFn: (vals: { categoryId: string; name: string; maxScore: number }) =>
      createAssessment(sectionId!, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }); setShowAsm(false); toast.push({ tone: 'success', title: 'Assessment added' }); },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Error', message: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '' }),
  });
  const delCatMut = useMutation({
    mutationFn: (catId: string) => deleteCategory(sectionId!, catId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }),
  });
  const delAsmMut = useMutation({
    mutationFn: (asmId: string) => deleteAssessment(sectionId!, asmId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }),
  });
  const saveMut = useMutation({
    mutationFn: () => {
      const scores = Object.entries(edits).map(([k, val]) => {
        const [enrollmentId, assessmentId] = k.split('|');
        return { enrollmentId, assessmentId, score: val === '' ? null : Number(val) };
      });
      return bulkSaveScores(sectionId!, scores);
    },
    onSuccess: () => {
      const n = Object.keys(edits).length;
      setEdits({});
      qc.invalidateQueries({ queryKey: ['gradebook', sectionId] });
      toast.push({ tone: 'success', title: `Saved ${n} score${n === 1 ? '' : 's'}` });
    },
    onError: () => toast.push({ tone: 'error', title: 'Save failed' }),
  });
  const finalizeMut = useMutation({
    mutationFn: async () => {
      if (Object.keys(edits).length) {
        await saveMut.mutateAsync();
      }
      return finalizeGrades(sectionId!);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gradebook', sectionId] });
      setShowFinalize(false);
      toast.push({ tone: 'success', title: 'Grades finalized', message: `${students.length} students locked.` });
    },
    onError: () => toast.push({ tone: 'error', title: 'Finalize failed' }),
  });

  // ---- Keyboard navigation across cells ------------------------------------
  const tableRef = useRef<HTMLDivElement>(null);
  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number, rows: number, cols: number) => {
    let nr = r, nc = c;
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); nr = Math.min(rows - 1, r + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nr = Math.max(0, r - 1); }
    else if (e.key === 'ArrowRight') {
      const t = e.currentTarget;
      if (t.selectionStart === t.value.length) { e.preventDefault(); nc = Math.min(cols - 1, c + 1); }
    } else if (e.key === 'ArrowLeft') {
      const t = e.currentTarget;
      if (t.selectionStart === 0) { e.preventDefault(); nc = Math.max(0, c - 1); }
    } else return;
    const next = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${nr}"][data-c="${nc}"]`);
    if (next) { next.focus(); next.select(); }
  };

  // ⌘S / Ctrl+S to save
  const editCount = Object.keys(edits).length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editCount > 0) saveMut.mutate();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editCount, saveMut]);

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-12 mt-3" />
      <Skeleton className="h-[60vh] mt-3" />
    </div>
  );
  if (!data || !section) return <div className="text-center text-red-500 py-16 text-sm">Section not found.</div>;

  return (
    <div>
      <Link to="/faculty/sections" className="text-xs text-stone-500 hover:text-olive-500 mb-3 flex items-center gap-1">
        <Icon name="chevron-left" size={12} /> Back to sections
      </Link>

      <PageHeader
        eyebrow={section.term_name}
        title={section.course_title}
        subtitle={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="font-mono font-semibold text-olive-500">{section.section_code}</span>
            {section.day_of_week && (
              <><span>·</span><span><span className="font-mono">{section.day_of_week}</span> · {section.start_time?.slice(0,5)}–{section.end_time?.slice(0,5)}</span></>
            )}
            {section.room && <><span>·</span><span className="flex items-center gap-1"><Icon name="map-pin" size={11} /> {section.room}</span></>}
            <span>·</span>
            <span className="flex items-center gap-1"><Icon name="users" size={11} /> {students.length} enrolled</span>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={() => setShowAsm(true)}>
              <Icon name="plus" size={14} /> Assessment
            </button>
            <button className="btn-ghost flex items-center gap-2 border border-khaki-200" onClick={() => setShowCat(true)}>
              <Icon name="plus" size={13} /> Category
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={() => setShowFinalize(true)} disabled={totalWeight !== 100}>
              <Icon name="award" size={14} /> Finalize grades
            </button>
          </div>
        }
        stats={[
          { label: 'Class average', value: classAvg != null ? classAvg.toFixed(1) : '—', icon: 'trending-up', tone: 'olive' },
          { label: 'Strong (≥90)',  value: strongCount, icon: 'award', tone: 'olive' },
          { label: 'At risk (<75)', value: atRiskCount, icon: 'alert-triangle', tone: atRiskCount > 0 ? 'red' : 'olive' },
          { label: 'Total weight',  value: `${totalWeight}%`, icon: totalWeight === 100 ? 'check' : 'alert-triangle', tone: totalWeight === 100 ? 'olive' : 'amber' },
        ]}
      />

      {/* Weight bar */}
      {categories.length > 0 && (
        <div className="card mb-4 !py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 group">
                <span className="w-2 h-2 rounded-full bg-olive-400" />
                <span className="text-xs font-medium text-stone-700">{c.name}</span>
                <span className="text-xs text-stone-500 tabular">{c.weight}%</span>
                <button onClick={() => { if (window.confirm(`Delete "${c.name}" and all its assessments?`)) delCatMut.mutate(c.id); }}
                  className="text-stone-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            <span className={`ml-auto text-xs font-semibold ${totalWeight === 100 ? 'text-olive-500' : 'text-amber-600'}`}>
              {totalWeight === 100 ? '✓ Weights total 100%' : `⚠ Weights total ${totalWeight}% (must equal 100)`}
            </span>
          </div>
        </div>
      )}

      {/* Filter / save bar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Search students…" className="w-64" />
        <div className="flex items-center gap-1.5">
          <Chip active={filter === 'all'}    onClick={() => setFilter('all')}>All ({students.length})</Chip>
          <Chip active={filter === 'risk'}   onClick={() => setFilter('risk')}><Icon name="alert-triangle" size={10} className="text-red-500" /> At risk ({atRiskCount})</Chip>
          <Chip active={filter === 'watch'}  onClick={() => setFilter('watch')}><Icon name="info" size={10} className="text-amber-500" /> Watch</Chip>
          <Chip active={filter === 'strong'} onClick={() => setFilter('strong')}><Icon name="award" size={10} className="text-olive-500" /> Strong</Chip>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {editCount > 0 ? (
            <>
              <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {editCount} unsaved change{editCount === 1 ? '' : 's'}
              </span>
              <button className="btn-primary flex items-center gap-2" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? <><span className="spinner" /> Saving…</> : <>Save changes <span className="kbd">⌘S</span></>}
              </button>
            </>
          ) : (
            <span className="text-xs text-stone-400 flex items-center gap-1.5">
              <Icon name="check" size={12} className="text-olive-400" /> All changes saved
            </span>
          )}
        </div>
      </div>

      {/* Gradebook grid */}
      {allAssessments.length === 0 ? (
        <div className="card text-center py-14 text-stone-400">
          <Icon name="clipboard-list" size={28} className="mx-auto mb-3 text-stone-300" />
          <p className="text-sm font-medium text-stone-600">No categories or assessments yet</p>
          <p className="text-xs text-stone-400 mt-1 mb-4">Add a category first, then assessments under it.</p>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setShowCat(true)}>
            <Icon name="plus" size={14} /> Add category
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto" ref={tableRef} style={{ maxHeight: '64vh' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="table-th sticky left-0 z-20 bg-beige-100 min-w-[220px]">Student</th>
                  {categories.map(c => (
                    <th key={c.id} colSpan={c.assessments.length || 1}
                      className="table-th text-center border-l border-beige-200 text-olive-600 bg-olive-50">
                      {c.name} <span className="text-stone-400 font-normal">· {c.weight}%</span>
                    </th>
                  ))}
                  <th className="table-th text-center bg-khaki-50 text-khaki-500 min-w-[80px]">Computed</th>
                  <th className="table-th text-center bg-beige-100 text-stone-600 min-w-[60px]">Status</th>
                </tr>
                <tr>
                  <th className="table-th sticky left-0 z-20 bg-beige-100" />
                  {allAssessments.map(a => (
                    <th key={a.id} className="table-th text-center border-l border-beige-200 min-w-[90px]">
                      <div className="flex items-center justify-center gap-1 group">
                        <span>{a.name}</span>
                        <button onClick={() => { if (window.confirm(`Delete "${a.name}"?`)) delAsmMut.mutate(a.id); }}
                          className="text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Icon name="x" size={10} />
                        </button>
                      </div>
                      <div className="text-stone-400 font-normal tabular text-[10px] mt-0.5">max {a.max_score}</div>
                    </th>
                  ))}
                  <th className="table-th text-center bg-khaki-50" />
                  <th className="table-th text-center bg-beige-100" />
                </tr>
              </thead>
              <tbody>
                {visible.map((s, rIdx) => {
                  const g = computedFor(s);
                  const rowTint = g != null && g < 75 ? 'row-risk' : g != null && g < 80 ? 'row-warn' : '';
                  return (
                    <tr key={s.enrollmentId} className={`hover:bg-beige-50 transition-colors ${rowTint}`}>
                      <td className="table-td sticky left-0 z-10 bg-white font-medium border-r border-beige-200">
                        <button className="flex items-center gap-2 text-left hover:text-olive-500 w-full"
                          onClick={() => setSelectedStudent(s)}>
                          <Avatar name={s.studentName} size={28} tone="beige" />
                          <span className="text-sm font-medium text-stone-800 truncate">{s.studentName}</span>
                        </button>
                      </td>
                      {allAssessments.map((a, cIdx) => {
                        const val = cellVal(s, a.id);
                        const tint = gradeTintForCell(val, a.max_score);
                        return (
                          <td key={a.id} className={`table-td p-1 border-l border-beige-100 ${tint || ''}`}>
                            <input
                              type="number" min={0} max={a.max_score} step="0.5"
                              value={val}
                              onChange={e => setEdits(prev => ({ ...prev, [cellKey(s.enrollmentId, a.id)]: e.target.value }))}
                              onKeyDown={e => onCellKey(e, rIdx, cIdx, visible.length, allAssessments.length)}
                              data-r={rIdx} data-c={cIdx}
                              className="w-full text-center rounded px-1 py-1 text-sm border border-transparent focus:border-olive-300 focus:outline-none bg-transparent focus:bg-white tabular"
                              placeholder="—"
                            />
                          </td>
                        );
                      })}
                      <td className={`table-td text-center font-semibold bg-khaki-50 tabular ${gradeColorForComputed(g)}`}>
                        {g != null ? g.toFixed(1) : '—'}
                      </td>
                      <td className="table-td text-center bg-beige-100">
                        <RiskPill grade={g} />
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={allAssessments.length + 3} className="table-td text-center text-stone-400 py-8 italic">No students match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center justify-between">
            <span>Tip: <span className="kbd">Tab</span> moves across, <span className="kbd">Enter</span> moves down. Empty cells are excluded from the computed grade.</span>
            <span className="tabular">{visible.length} of {students.length} students</span>
          </div>
        </div>
      )}

      {showCat && (
        <CategoryModal totalWeight={totalWeight} onClose={() => setShowCat(false)}
          onCreate={(name, weight) => catMut.mutate({ name, weight })} isPending={catMut.isPending} />
      )}
      {showAsm && (
        <AssessmentModal categories={categories} onClose={() => setShowAsm(false)}
          onCreate={(categoryId, name, maxScore) => asmMut.mutate({ categoryId, name, maxScore })} isPending={asmMut.isPending} />
      )}
      {showFinalize && (
        <FinalizeModal students={students} computedFor={computedFor} onClose={() => setShowFinalize(false)}
          onConfirm={() => finalizeMut.mutate()} isPending={finalizeMut.isPending} />
      )}
      {selectedStudent && (
        <StudentDetailModal student={selectedStudent} categories={categories} computedFor={computedFor}
          onClose={() => setSelectedStudent(null)} />
      )}
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================

function CategoryModal({ totalWeight, onClose, onCreate, isPending }:
  { totalWeight: number; onClose: () => void; onCreate: (name: string, weight: number) => void; isPending: boolean }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const remaining = 100 - totalWeight;
  return (
    <Modal title="New category" subtitle="Categories group related assessments and define their weight in the final grade." onClose={onClose}>
      <div className="space-y-4">
        <InputField label="Category name" value={name} onChange={e => setName(e.target.value)} placeholder="Quizzes, Lab work, Projects…" autoFocus />
        <InputField label="Weight (%)" type="number" min="0" max={remaining}
          value={weight} onChange={e => setWeight(e.target.value)}
          placeholder={`Up to ${remaining}%`} hint={`Remaining: ${remaining}%`} />
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isPending || !name || !weight}
            onClick={() => onCreate(name, Number(weight))}>
            {isPending ? 'Adding…' : 'Create category'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AssessmentModal({ categories, onClose, onCreate, isPending }:
  { categories: Category[]; onClose: () => void; onCreate: (catId: string, name: string, maxScore: number) => void; isPending: boolean }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [name, setName] = useState('');
  const [maxScore, setMaxScore] = useState('');
  return (
    <Modal title="New assessment" subtitle="Will appear as a new column in the gradebook." onClose={onClose}>
      <div className="space-y-4">
        <SelectField label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          {categories.length === 0 && <option value="">Add a category first</option>}
          {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.weight}%)</option>)}
        </SelectField>
        <InputField label="Assessment name" value={name} onChange={e => setName(e.target.value)} placeholder="Quiz 4, Midterm…" autoFocus />
        <InputField label="Max score" type="number" min="1" value={maxScore} onChange={e => setMaxScore(e.target.value)} placeholder="50" />
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isPending || !categoryId || !name || !maxScore}
            onClick={() => onCreate(categoryId, name, Number(maxScore))}>
            {isPending ? 'Adding…' : 'Create assessment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FinalizeModal({ students, computedFor, onClose, onConfirm, isPending }:
  { students: Student[]; computedFor: (s: Student) => number | null; onClose: () => void; onConfirm: () => void; isPending: boolean }) {
  const grades = students.map(computedFor);
  const passing = grades.filter(g => g != null && g >= 75).length;
  const failing = grades.filter(g => g != null && g < 75).length;
  const missing = grades.filter(g => g == null).length;

  return (
    <Modal title="Finalize grades" subtitle="Once locked, students will see their final letter grades. Numeric grades will be archived." onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center !py-4">
            <div className="text-3xl font-display tabular font-medium text-olive-500">{passing}</div>
            <div className="text-xs text-stone-500 mt-1">Passing</div>
          </div>
          <div className="card text-center !py-4">
            <div className="text-3xl font-display tabular font-medium text-red-500">{failing}</div>
            <div className="text-xs text-stone-500 mt-1">Failing</div>
          </div>
          <div className="card text-center !py-4">
            <div className="text-3xl font-display tabular font-medium text-stone-400">{missing}</div>
            <div className="text-xs text-stone-500 mt-1">No data</div>
          </div>
        </div>
        {missing > 0 && (
          <div className="text-sm bg-amber-50 border border-amber-100 text-amber-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
            <span>{missing} student{missing === 1 ? ' has' : 's have'} no scores recorded and will be skipped. You can add scores and finalize later.</span>
          </div>
        )}
        <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-600 flex items-start gap-2">
          <Icon name="info" size={14} className="mt-0.5 flex-shrink-0 text-stone-400" />
          <span>Numeric grades are converted to the PH letter scale (1.00–5.00). Letter grades become visible to students immediately.</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={onConfirm} disabled={isPending}>
            <Icon name="award" size={14} />
            {isPending ? 'Finalizing…' : `Lock ${passing + failing} grade${passing + failing === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StudentDetailModal({ student, categories, computedFor, onClose }:
  { student: Student; categories: Category[]; computedFor: (s: Student) => number | null; onClose: () => void }) {
  const g = computedFor(student);
  const note = g == null ? 'No assessments scored yet.'
    : g < 75 ? 'Below passing — recommend academic intervention. Consider scheduling a 1-on-1 or directing to peer tutoring.'
    : g < 80 ? 'Borderline — performance is at risk of slipping. A check-in could help.'
    : g < 90 ? 'On track. Consistent performance across categories.'
    : 'Strong performer — consider involvement in research or advanced projects.';

  return (
    <Modal title={student.studentName} subtitle={student.letterGrade ? `Final grade: ${student.letterGrade}` : 'In progress'} onClose={onClose} size="lg">
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 mb-5">
        <div className="flex items-center justify-center">
          <GradeRing value={g} size={120} stroke={10} label="Grade" />
        </div>
        <div className="space-y-3 self-center">
          <div className="flex items-center gap-2 flex-wrap">
            <RiskPill grade={g} />
            {g != null && (
              <span className="text-xs text-stone-500">Equivalent: <span className="font-semibold text-stone-700">{numericToLetter(g)}</span></span>
            )}
          </div>
          <p className="text-sm text-stone-600">{note}</p>
        </div>
      </div>

      <div className="space-y-3">
        {categories.map(c => {
          let earned = 0, max = 0;
          c.assessments.forEach(a => {
            const v = student.scores[a.id];
            if (v != null) { earned += v; max += a.max_score; }
          });
          const pct = max > 0 ? (earned / max) * 100 : null;
          return (
            <div key={c.id} className="border border-beige-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-stone-800">{c.name}</div>
                  <div className="text-xs text-stone-400">Weight {c.weight}%</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular text-stone-800">{pct != null ? pct.toFixed(1) : '—'}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">%</div>
                </div>
              </div>
              <ProgressBar value={pct ?? 0} color={pct == null ? '#DDD0AD' : pct >= 80 ? '#6B8030' : pct >= 75 ? '#B09A65' : '#dc2626'} />
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {c.assessments.map(a => {
                  const v = student.scores[a.id];
                  return (
                    <div key={a.id} className="flex justify-between px-2 py-1 rounded bg-beige-50">
                      <span className="text-stone-600 truncate mr-2">{a.name}</span>
                      <span className="tabular font-medium text-stone-700">
                        {v != null ? v : <span className="text-stone-300">—</span>}
                        <span className="text-stone-400 font-normal">/{a.max_score}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
