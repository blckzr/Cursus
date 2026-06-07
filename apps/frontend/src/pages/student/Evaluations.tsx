/**
 * Student → Evaluations
 *
 * Shows pending evaluations the student owes for the active term, plus the
 * ones they've already submitted. The form is one card per question. Submit
 * is atomic — on success the section moves to the "submitted" list and the
 * grade-reveal gate for that section drops on the Grades page.
 *
 * Reminder of the anonymity contract: the student's identity is sent to the
 * backend to enforce one-shot uniqueness and drive the grade gate, but it is
 * NEVER joined to the answers in any faculty-facing query.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEvalStatus, getEvalQuestions, submitEvaluation,
  type EvalPendingSection,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

export default function StudentEvaluations() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['eval-status'],
    queryFn:  getEvalStatus,
  });

  const [target, setTarget] = useState<EvalPendingSection | null>(null);

  if (isLoading) return <div className="card p-4"><Skeleton className="h-64 rounded-lg" /></div>;

  const term     = status?.term ?? null;
  const isOpen   = status?.isOpen ?? false;
  const opensAt  = status?.opensAt;
  const closesAt = status?.closesAt;
  const pending  = status?.pending ?? [];
  const done     = status?.done    ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Anonymous"
        title="Faculty evaluations"
        subtitle={
          term
            ? `${term.name} · ${pending.length} pending · ${done.length} submitted`
            : 'No active term right now.'
        }
      />

      {/* Window status */}
      {term && !isOpen && (
        <div className="card mb-4 border-amber-200 dark:border-amber-400/40">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-400/20 text-amber-600 dark:text-amber-200 flex items-center justify-center flex-shrink-0">
              <Icon name="clock" size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">Evaluation window not open</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {opensAt
                  ? <>Opens {new Date(opensAt).toLocaleString()} {closesAt && <>· closes {new Date(closesAt).toLocaleString()}</>}</>
                  : 'The registrar hasn\'t scheduled the window for this term yet.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Anonymity reminder */}
      {term && isOpen && pending.length > 0 && (
        <div className="card mb-4 border-olive-200 dark:border-olive-400/40 bg-olive-50/40 dark:!bg-olive-500/[0.06]">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-olive-100 dark:bg-olive-500/30 text-olive-600 dark:text-olive-100 flex items-center justify-center flex-shrink-0">
              <Icon name="shield" size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">Your responses are anonymous</div>
              <div className="text-xs text-stone-500 dark:text-stone-300 mt-0.5">
                Faculty and admins see <strong>aggregate scores only</strong>, never your name or individual answers.
                Submit honest feedback to unlock your finalized grades on the Grades page.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending */}
      <SectionTitle>Pending ({pending.length})</SectionTitle>
      {pending.length === 0 ? (
        <div className="card mb-6">
          <EmptyState icon="check" title="No pending evaluations" message="You're all caught up." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {pending.map(s => (
            <SectionRow key={s.sectionId} section={s} state="pending" disabled={!isOpen} onClick={() => setTarget(s)} />
          ))}
        </div>
      )}

      {/* Submitted */}
      {done.length > 0 && (
        <>
          <SectionTitle>Submitted ({done.length})</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {done.map(s => <SectionRow key={s.sectionId} section={s} state="done" />)}
          </div>
        </>
      )}

      {target && (
        <EvaluateModal section={target} onClose={() => setTarget(null)} />
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold mb-2">{children}</h3>;
}

function SectionRow({ section, state, disabled, onClick }: {
  section: EvalPendingSection;
  state: 'pending' | 'done';
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      disabled={disabled}
      className={`card text-left flex items-start gap-3 ${
        onClick ? 'hover:border-olive-300 dark:hover:border-olive-400/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed' : ''
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        state === 'done'
          ? 'bg-olive-50 dark:bg-olive-500/20 text-olive-600 dark:text-olive-100'
          : 'bg-amber-50 dark:bg-amber-400/20 text-amber-600 dark:text-amber-200'
      }`}>
        <Icon name={state === 'done' ? 'check' : 'pencil'} size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-mono text-xs font-semibold text-olive-500 dark:text-olive-200 flex-shrink-0">{section.courseCode}</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">{section.courseTitle}</span>
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
          <Icon name="user" size={10} className="inline mr-1 align-baseline" />
          {section.facultyName}
        </div>
        <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 uppercase tracking-wider">
          {section.sectionCode}
        </div>
      </div>
    </Wrapper>
  );
}

// ============================================================================
// Evaluate modal — one card per question, atomic submit.
// ============================================================================

function EvaluateModal({ section, onClose }: { section: EvalPendingSection; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: questions = [], isLoading } = useQuery({ queryKey: ['eval-questions'], queryFn: getEvalQuestions });

  const [answers, setAnswers] = useState<Record<string, { likertValue?: number; textValue?: string }>>({});
  const [err, setErr] = useState('');

  const ready = useMemo(() => {
    return questions.length > 0 && questions.every(q => {
      const a = answers[q.id];
      if (!a) return false;
      if (q.kind === 'likert_5') return a.likertValue != null;
      // Text questions are optional in content but require the row to exist
      return true;
    });
  }, [questions, answers]);

  const submitMut = useMutation({
    mutationFn: () => submitEvaluation(
      section.sectionId,
      questions.map(q => ({
        questionId:  q.id,
        likertValue: answers[q.id]?.likertValue,
        textValue:   answers[q.id]?.textValue?.trim() || undefined,
      })),
    ),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Evaluation submitted', message: 'Thanks — this section\'s grade is now unlocked.' });
      qc.invalidateQueries({ queryKey: ['eval-status'] });
      qc.invalidateQueries({ queryKey: ['must-evaluate-first'] });
      onClose();
    },
    onError: (e: unknown) => setErr(parseApiError(e).message),
  });

  return (
    <Modal
      title={`Evaluate ${section.courseCode}`}
      subtitle={`${section.courseTitle} · ${section.facultyName}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-olive-50 dark:bg-olive-500/15 border border-olive-200 dark:border-olive-400/40 rounded-lg p-3 text-xs text-stone-700 dark:text-stone-200 flex items-start gap-2">
          <Icon name="shield" size={12} className="mt-0.5 flex-shrink-0 text-olive-500 dark:text-olive-200" />
          <span>Your answers are <strong>anonymous</strong>. The instructor sees only aggregated scores across all submitting students.</span>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <ol className="space-y-3">
            {questions.map((q, idx) => (
              <li key={q.id} className="border border-beige-200 dark:border-stone-700 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-2">
                  <span className="font-mono text-[11px] text-stone-400 dark:text-stone-500 font-semibold mt-0.5">{idx + 1}.</span>
                  <span className="text-sm text-stone-800 dark:text-stone-100">{q.prompt}</span>
                </div>

                {q.kind === 'likert_5' ? (
                  <div className="flex items-center gap-1.5 flex-wrap pl-5">
                    {[1, 2, 3, 4, 5].map(v => {
                      const active = answers[q.id]?.likertValue === v;
                      const labels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], likertValue: v } }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-olive-500 dark:bg-olive-400 text-white border-olive-500 dark:border-olive-400'
                              : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-beige-200 dark:border-stone-700 hover:border-olive-300 dark:hover:border-olive-400/60'
                          }`}
                          title={labels[v - 1]}
                        >
                          {v}
                        </button>
                      );
                    })}
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-2">1 = strongly disagree, 5 = strongly agree</span>
                  </div>
                ) : (
                  <textarea
                    className="input min-h-[80px]"
                    value={answers[q.id]?.textValue ?? ''}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], textValue: e.target.value } }))}
                    placeholder="Optional — your honest feedback helps the faculty improve."
                    maxLength={2000}
                  />
                )}
              </li>
            ))}
          </ol>
        )}

        {err && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-400/40 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { setErr(''); submitMut.mutate(); }}
            disabled={!ready || submitMut.isPending}
          >
            {submitMut.isPending
              ? <><span className="spinner" /> Submitting…</>
              : <><Icon name="check" size={14} /> Submit evaluation</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
