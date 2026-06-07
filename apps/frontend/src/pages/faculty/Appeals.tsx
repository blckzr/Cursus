import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listFacultyAppeals, acceptAppeal, resolveAppealFaculty, escalateAppeal,
  type AppealRow,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import AppealCard from '../../components/AppealCard';
import { InputField } from '../../components/FormField';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

type Filter = 'active' | 'pending' | 'faculty_review' | 'all';

export default function FacultyAppeals() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('active');

  const { data: appeals = [], isLoading } = useQuery<AppealRow[]>({
    queryKey: ['faculty-appeals'],
    queryFn:  () => listFacultyAppeals(),
  });

  const counts = useMemo(() => ({
    pending:        appeals.filter(a => a.status === 'pending').length,
    faculty_review: appeals.filter(a => a.status === 'faculty_review').length,
    active:         appeals.filter(a => a.status === 'pending' || a.status === 'faculty_review').length,
    all:            appeals.length,
  }), [appeals]);

  const visible = useMemo(() => {
    if (filter === 'active') return appeals.filter(a => a.status === 'pending' || a.status === 'faculty_review');
    if (filter === 'all')    return appeals;
    return appeals.filter(a => a.status === filter);
  }, [appeals, filter]);

  // ── Action modals ─────────────────────────────────────────────────
  const [resolveTarget,  setResolveTarget]  = useState<AppealRow | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<AppealRow | null>(null);

  const acceptMut = useMutation({
    mutationFn: (id: string) => acceptAppeal(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['faculty-appeals'] }); toast.push({ tone: 'success', title: 'Accepted for review' }); },
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Could not accept', message: parseApiError(e).message }),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Grade appeals"
        title="Appeals on my sections"
        subtitle="Students can appeal a final grade within 14 days of finalization. Accept to start review, then resolve (with or without a grade change) or escalate to the dean."
        stats={[
          { label: 'Pending',  value: counts.pending,        icon: 'alert-triangle', tone: counts.pending > 0 ? 'amber' : 'olive' },
          { label: 'In review', value: counts.faculty_review, icon: 'clock',          tone: 'khaki' },
          { label: 'Active',   value: counts.active,         icon: 'inbox',          tone: 'olive' },
          { label: 'All-time', value: counts.all,            icon: 'message',        tone: 'olive' },
        ]}
      />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Chip active={filter === 'active'}         onClick={() => setFilter('active')}>Active ({counts.active})</Chip>
        <Chip active={filter === 'pending'}        onClick={() => setFilter('pending')}>Pending ({counts.pending})</Chip>
        <Chip active={filter === 'faculty_review'} onClick={() => setFilter('faculty_review')}>In review ({counts.faculty_review})</Chip>
        <Chip active={filter === 'all'}            onClick={() => setFilter('all')}>All ({counts.all})</Chip>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : visible.length === 0 ? (
        <div className="card p-0">
          <EmptyState icon="check" title="No appeals here" message="Nothing to review right now." />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(a => (
            <AppealCard
              key={a.id}
              appeal={a}
              showStudent
              actions={
                a.status === 'pending' ? (
                  <button
                    className="btn-primary text-xs flex items-center gap-1.5"
                    onClick={() => acceptMut.mutate(a.id)}
                    disabled={acceptMut.isPending}
                  >
                    <Icon name="check" size={12} /> Accept for review
                  </button>
                ) : a.status === 'faculty_review' ? (
                  <>
                    <button className="btn-ghost text-xs flex items-center gap-1.5 border border-khaki-200" onClick={() => setEscalateTarget(a)}>
                      <Icon name="arrow-up" size={11} /> Escalate
                    </button>
                    <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setResolveTarget(a)}>
                      <Icon name="check" size={12} /> Resolve
                    </button>
                  </>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {resolveTarget && (
        <ResolveModal
          target={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['faculty-appeals'] }); setResolveTarget(null); }}
        />
      )}
      {escalateTarget && (
        <EscalateModal
          target={escalateTarget}
          onClose={() => setEscalateTarget(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['faculty-appeals'] }); setEscalateTarget(null); }}
        />
      )}
    </div>
  );
}

// ─── Resolve modal ──────────────────────────────────────────────────────────

function ResolveModal({ target, onClose, onDone }: {
  target: AppealRow; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<'grade_changed' | 'denied'>('grade_changed');
  const [note, setNote] = useState('');
  const [letter, setLetter] = useState('');
  const [numeric, setNumeric] = useState('');
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: () => resolveAppealFaculty(target.id, {
      outcome,
      facultyNote:     note,
      resolvedGrade:   outcome === 'grade_changed' ? letter : undefined,
      resolvedNumeric: outcome === 'grade_changed' ? Number(numeric) : undefined,
    }),
    onSuccess:  () => {
      toast.push({ tone: 'success', title: 'Appeal resolved' });
      onDone();
    },
    onError:    (e: unknown) => setErr(parseApiError(e).message),
  });

  const ready = note.trim().length >= 10
    && (outcome === 'denied' || (letter && numeric && Number(numeric) >= 0 && Number(numeric) <= 100));

  return (
    <Modal title="Resolve appeal" subtitle={`${target.course_code} · ${target.student_name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Outcome</label>
          <div className="space-y-1.5">
            <label className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
              outcome === 'grade_changed' ? 'border-olive-300 bg-olive-50' : 'border-beige-200 hover:bg-beige-50'
            }`}>
              <input type="radio" checked={outcome === 'grade_changed'} onChange={() => setOutcome('grade_changed')} className="mt-1" />
              <div>
                <div className="text-sm font-medium text-stone-800">Change the grade</div>
                <div className="text-[11px] text-stone-500">Updates `enrollments.numeric_grade` + `letter_grade`. Audit-logged.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
              outcome === 'denied' ? 'border-olive-300 bg-olive-50' : 'border-beige-200 hover:bg-beige-50'
            }`}>
              <input type="radio" checked={outcome === 'denied'} onChange={() => setOutcome('denied')} className="mt-1" />
              <div>
                <div className="text-sm font-medium text-stone-800">Deny the appeal</div>
                <div className="text-[11px] text-stone-500">Original grade stands. The student will see your justification.</div>
              </div>
            </label>
          </div>
        </div>

        {outcome === 'grade_changed' && (
          <div className="grid grid-cols-2 gap-3">
            <InputField label="New letter grade" value={letter} onChange={e => setLetter(e.target.value)} placeholder="1.50" />
            <InputField label="New numeric grade" type="number" min="0" max="100" step="0.01" value={numeric} onChange={e => setNumeric(e.target.value)} placeholder="90.00" />
          </div>
        )}

        <div>
          <label className="label">Justification for the student</label>
          <textarea
            className="input min-h-[100px]"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Explain how you reviewed the appeal and the basis for your decision."
          />
          <p className="text-[11px] text-stone-400 mt-1">at least 10 characters</p>
        </div>

        {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { setErr(''); mut.mutate(); }} disabled={!ready || mut.isPending}>
            {mut.isPending ? 'Resolving…' : 'Confirm resolution'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Escalate modal ─────────────────────────────────────────────────────────

function EscalateModal({ target, onClose, onDone }: {
  target: AppealRow; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const mut = useMutation({
    mutationFn: () => escalateAppeal(target.id, note),
    onSuccess:  () => {
      toast.push({ tone: 'info', title: 'Escalated to the dean' });
      onDone();
    },
    onError:    (e: unknown) => setErr(parseApiError(e).message),
  });
  return (
    <Modal title="Escalate to the dean" subtitle={`${target.course_code} · ${target.student_name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-700 flex items-start gap-2">
          <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
          <span>The dean will receive a notification with your note attached. They'll have final say on the resolution.</span>
        </div>
        <div>
          <label className="label">Note for the dean</label>
          <textarea
            className="input min-h-[120px]"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Summarise the appeal, your initial review, and why you need the dean's input."
          />
        </div>
        {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { setErr(''); mut.mutate(); }} disabled={note.trim().length < 10 || mut.isPending}>
            {mut.isPending ? 'Escalating…' : 'Escalate'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
