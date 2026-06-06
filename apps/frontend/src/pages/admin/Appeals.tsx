import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAdminAppeals, resolveAppealDean, type AppealRow } from '../../api';
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

type Filter = 'dean_review' | 'active' | 'all';

export default function AdminAppeals() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('dean_review');

  const { data: appeals = [], isLoading } = useQuery<AppealRow[]>({
    queryKey: ['admin-appeals'],
    queryFn:  () => listAdminAppeals(),
  });

  const counts = useMemo(() => ({
    dean_review: appeals.filter(a => a.status === 'dean_review').length,
    active:      appeals.filter(a => a.status !== 'resolved' && a.status !== 'withdrawn').length,
    all:         appeals.length,
  }), [appeals]);

  const visible = useMemo(() => {
    if (filter === 'dean_review') return appeals.filter(a => a.status === 'dean_review');
    if (filter === 'active')      return appeals.filter(a => a.status !== 'resolved' && a.status !== 'withdrawn');
    return appeals;
  }, [appeals, filter]);

  const [resolveTarget, setResolveTarget] = useState<AppealRow | null>(null);

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="Grade appeals — dean review"
        subtitle="Appeals the faculty escalated for your final decision. You can also see all appeals across the institution."
        stats={[
          { label: "Dean's queue", value: counts.dean_review, icon: 'alert-triangle',
            tone: counts.dean_review > 0 ? 'amber' : 'olive' },
          { label: 'All active',   value: counts.active, icon: 'inbox' },
          { label: 'All-time',     value: counts.all,    icon: 'message' },
        ]}
      />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Chip active={filter === 'dean_review'} onClick={() => setFilter('dean_review')}>For dean review ({counts.dean_review})</Chip>
        <Chip active={filter === 'active'}      onClick={() => setFilter('active')}>Active across system ({counts.active})</Chip>
        <Chip active={filter === 'all'}         onClick={() => setFilter('all')}>All ({counts.all})</Chip>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : visible.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="check"
            title="Nothing here"
            message={filter === 'dean_review'
              ? 'No appeals waiting on dean review.'
              : 'No appeals match this filter.'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(a => (
            <AppealCard
              key={a.id}
              appeal={a}
              showStudent
              actions={
                a.status === 'dean_review' ? (
                  <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setResolveTarget(a)}>
                    <Icon name="award" size={12} /> Decide
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {resolveTarget && (
        <DeanResolveModal
          target={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['admin-appeals'] }); setResolveTarget(null); }}
        />
      )}
    </div>
  );
}

function DeanResolveModal({ target, onClose, onDone }: {
  target: AppealRow; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<'grade_changed' | 'denied'>('grade_changed');
  const [note, setNote] = useState('');
  const [letter, setLetter] = useState('');
  const [numeric, setNumeric] = useState('');
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: () => resolveAppealDean(target.id, {
      outcome,
      deanNote:        note,
      resolvedGrade:   outcome === 'grade_changed' ? letter : undefined,
      resolvedNumeric: outcome === 'grade_changed' ? Number(numeric) : undefined,
    }),
    onSuccess:  () => { toast.push({ tone: 'success', title: 'Appeal resolved' }); onDone(); },
    onError:    (e: unknown) => setErr(parseApiError(e).message),
  });

  const ready = note.trim().length >= 10
    && (outcome === 'denied' || (letter && numeric && Number(numeric) >= 0 && Number(numeric) <= 100));

  return (
    <Modal title="Dean's resolution" subtitle={`${target.course_code} · ${target.student_name}`} onClose={onClose} size="lg">
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
                <div className="text-[11px] text-stone-500">Overrides the faculty's original grade. Audit-logged with both old and new values.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
              outcome === 'denied' ? 'border-olive-300 bg-olive-50' : 'border-beige-200 hover:bg-beige-50'
            }`}>
              <input type="radio" checked={outcome === 'denied'} onChange={() => setOutcome('denied')} className="mt-1" />
              <div>
                <div className="text-sm font-medium text-stone-800">Deny the appeal</div>
                <div className="text-[11px] text-stone-500">Original grade stands. The student and original faculty will see your note.</div>
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
          <label className="label">Dean's note</label>
          <textarea
            className="input min-h-[100px]"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Explain the rationale. This will be visible to both the student and the original faculty."
          />
        </div>

        {err && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { setErr(''); mut.mutate(); }} disabled={!ready || mut.isPending}>
            {mut.isPending ? 'Resolving…' : "Apply dean's resolution"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
