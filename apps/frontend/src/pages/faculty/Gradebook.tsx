import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGradebook, createCategory, createAssessment,
  bulkSaveScores, finalizeGrades, deleteCategory, deleteAssessment,
} from '../../api';
import Modal from '../../components/Modal';
import { InputField } from '../../components/FormField';

interface Assessment { id: string; name: string; max_score: number; display_order: number; }
interface Category   { id: string; name: string; weight: number; assessments: Assessment[]; }
interface Student    { enrollmentId: string; studentName: string; scores: Record<string, number | null>; computedGrade: number | null; finalizedGrade: number | null; letterGrade: string | null; }

export default function Gradebook() {
  const { id: sectionId } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gradebook', sectionId],
    queryFn: () => getGradebook(sectionId!),
  });

  // Local edits buffer: key = `enrollmentId-assessmentId`
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showCat, setShowCat]   = useState(false);
  const [showAsm, setShowAsm]   = useState(false);
  const [catForm, setCatForm]   = useState({ name: '', weight: '' });
  const [asmForm, setAsmForm]   = useState({ categoryId: '', name: '', maxScore: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const catMut = useMutation({
    mutationFn: () => createCategory(sectionId!, { name: catForm.name, weight: Number(catForm.weight) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }); setShowCat(false); setCatForm({ name: '', weight: '' }); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const asmMut = useMutation({
    mutationFn: () => createAssessment(sectionId!, { categoryId: asmForm.categoryId, name: asmForm.name, maxScore: Number(asmForm.maxScore) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }); setShowAsm(false); setAsmForm({ categoryId: '', name: '', maxScore: '' }); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error'),
  });

  const delCatMut = useMutation({
    mutationFn: (catId: string) => deleteCategory(sectionId!, catId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }),
  });

  const delAsmMut = useMutation({
    mutationFn: (asmId: string) => deleteAssessment(sectionId!, asmId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gradebook', sectionId] }),
  });

  const handleSaveScores = async () => {
    setSaving(true);
    try {
      const scores = Object.entries(edits).map(([key, val]) => {
        const [enrollmentId, assessmentId] = key.split('|');
        return { enrollmentId, assessmentId, score: val === '' ? null : Number(val) };
      });
      await bulkSaveScores(sectionId!, scores);
      setEdits({});
      qc.invalidateQueries({ queryKey: ['gradebook', sectionId] });
    } catch { setErr('Failed to save scores'); }
    finally { setSaving(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize grades for all students in this section? This will lock their final grades.')) return;
    setFinalizing(true);
    try {
      await finalizeGrades(sectionId!);
      qc.invalidateQueries({ queryKey: ['gradebook', sectionId] });
    } catch { setErr('Failed to finalize grades'); }
    finally { setFinalizing(false); }
  };

  if (isLoading) return <div className="text-center text-stone-400 py-16 text-sm">Loading gradebook…</div>;
  if (!data)     return <div className="text-center text-red-500 py-16 text-sm">Section not found.</div>;

  const { section, categories, students } = data as { section: Record<string, string>; categories: Category[]; students: Student[] };
  const allAssessments = categories.flatMap(c => c.assessments.map(a => ({ ...a, categoryName: c.name })));
  const totalWeight = categories.reduce((s, c) => s + Number(c.weight), 0);

  const cellKey = (eId: string, aId: string) => `${eId}|${aId}`;
  const cellVal = (student: Student, aId: string) => {
    const k = cellKey(student.enrollmentId, aId);
    return edits[k] !== undefined ? edits[k] : (student.scores[aId] ?? '');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link to="/faculty" className="text-xs text-stone-400 hover:text-olive-500 mb-1 block">← Back to Sections</Link>
          <h1 className="text-2xl font-bold text-stone-800">{section.section_code}</h1>
          <p className="text-stone-500 text-sm">{section.course_title} · {section.term_name}</p>
        </div>
        <div className="flex gap-2">
          {Object.keys(edits).length > 0 && (
            <button className="btn-secondary" onClick={handleSaveScores} disabled={saving}>
              {saving ? 'Saving…' : `Save ${Object.keys(edits).length} changes`}
            </button>
          )}
          <button className="btn-primary" onClick={() => { setShowAsm(true); setErr(''); }}>+ Assessment</button>
          <button className="btn-secondary" onClick={() => { setShowCat(true); setErr(''); }}>+ Category</button>
          <button className="btn-ghost border border-khaki-300" onClick={handleFinalize} disabled={finalizing}>
            {finalizing ? 'Finalizing…' : 'Finalize Grades'}
          </button>
        </div>
      </div>

      {/* Weight bar */}
      {categories.length > 0 && (
        <div className="card mb-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 group">
                <span className="text-xs font-medium text-stone-600">{c.name}</span>
                <span className="text-xs text-khaki-500">{c.weight}%</span>
                <button onClick={() => confirm(`Delete "${c.name}" and all its assessments?`) && delCatMut.mutate(c.id)}
                  className="text-stone-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
              </div>
            ))}
            <span className={`ml-auto text-xs font-semibold ${totalWeight === 100 ? 'text-olive-500' : 'text-red-500'}`}>
              Total: {totalWeight}% {totalWeight !== 100 ? '⚠ must equal 100%' : '✓'}
            </span>
          </div>
        </div>
      )}

      {/* Grid */}
      {allAssessments.length === 0 ? (
        <div className="card text-center py-12 text-stone-400 text-sm">
          No categories or assessments yet. Add a category first, then assessments.
        </div>
      ) : (
        <div className="card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Category header row */}
              <tr>
                <th className="table-th sticky left-0 bg-beige-100 z-10 min-w-[180px]">Student</th>
                {categories.map(c => (
                  <th key={c.id} colSpan={c.assessments.length || 1}
                    className="table-th text-center border-l border-beige-200 text-olive-600 bg-olive-50">
                    {c.name} ({c.weight}%)
                  </th>
                ))}
                <th className="table-th text-center bg-khaki-50 text-khaki-500">Computed</th>
                <th className="table-th text-center bg-olive-50 text-olive-600">Final</th>
              </tr>
              {/* Assessment header row */}
              <tr>
                <th className="table-th sticky left-0 bg-beige-100 z-10" />
                {allAssessments.map(a => (
                  <th key={a.id} className="table-th text-center border-l border-beige-200 min-w-[90px]">
                    <div className="flex items-center justify-center gap-1">
                      <span>{a.name}</span>
                      <button onClick={() => confirm(`Delete "${a.name}"?`) && delAsmMut.mutate(a.id)}
                        className="text-stone-300 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="text-stone-400 font-normal">/{a.max_score}</div>
                  </th>
                ))}
                <th className="table-th text-center bg-khaki-50" />
                <th className="table-th text-center bg-olive-50" />
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.enrollmentId} className="hover:bg-beige-50">
                  <td className="table-td sticky left-0 bg-white font-medium border-r border-beige-200 z-10">{student.studentName}</td>
                  {allAssessments.map(a => (
                    <td key={a.id} className="table-td p-1 border-l border-beige-100">
                      <input
                        type="number" min={0} max={a.max_score} step="0.5"
                        value={cellVal(student, a.id)}
                        onChange={e => setEdits(prev => ({ ...prev, [cellKey(student.enrollmentId, a.id)]: e.target.value }))}
                        className="w-full text-center rounded px-1 py-1 text-sm border border-transparent focus:border-olive-300 focus:outline-none bg-transparent focus:bg-white"
                      />
                    </td>
                  ))}
                  <td className="table-td text-center font-medium bg-khaki-50 text-khaki-500">
                    {student.computedGrade !== null ? student.computedGrade.toFixed(2) : '—'}
                  </td>
                  <td className="table-td text-center font-semibold bg-olive-50 text-olive-600">
                    {student.letterGrade ? `${student.letterGrade}` : '—'}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan={allAssessments.length + 3} className="table-td text-center text-stone-400 py-8">No students enrolled.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {err && <p className="text-red-600 text-sm mt-3">{err}</p>}

      {/* Add Category Modal */}
      {showCat && (
        <Modal title="Add Category" onClose={() => setShowCat(false)}>
          <div className="space-y-4">
            <InputField label="Category Name" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="Quizzes" />
            <InputField label="Weight (%)" type="number" value={catForm.weight} onChange={e => setCatForm(f => ({ ...f, weight: e.target.value }))} placeholder="30" />
            <p className="text-xs text-stone-400">Current total weight: {totalWeight}%. Remaining: {100 - totalWeight}%</p>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1" onClick={() => catMut.mutate()} disabled={catMut.isPending}>
                {catMut.isPending ? 'Adding…' : 'Add Category'}
              </button>
              <button className="btn-ghost" onClick={() => setShowCat(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Assessment Modal */}
      {showAsm && (
        <Modal title="Add Assessment" onClose={() => setShowAsm(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Category</label>
              <select className="input" value={asmForm.categoryId} onChange={e => setAsmForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <InputField label="Assessment Name" value={asmForm.name} onChange={e => setAsmForm(f => ({ ...f, name: e.target.value }))} placeholder="Quiz 1" />
            <InputField label="Max Score" type="number" value={asmForm.maxScore} onChange={e => setAsmForm(f => ({ ...f, maxScore: e.target.value }))} placeholder="50" />
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1" onClick={() => asmMut.mutate()} disabled={asmMut.isPending}>
                {asmMut.isPending ? 'Adding…' : 'Add Assessment'}
              </button>
              <button className="btn-ghost" onClick={() => setShowAsm(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
