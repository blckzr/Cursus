/**
 * Admin → Evaluations
 *
 * Three tabs:
 *   • Rollup — per-faculty K-anonymous mean rating across a term.
 *   • Period — set/adjust the evaluation window for a term.
 *   • Questions — manage the institution-wide question bank.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminEvalRollup, getTerms,
  getEvalPeriod, setEvalPeriod,
  listAdminEvalQuestions, createEvalQuestion, updateEvalQuestion,
  type AdminEvalRollup, type EvalQuestion,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';
import { InputField, SelectField } from '../../components/FormField';

const isActive = (v: unknown) => v === true || v === 'true';

export default function AdminEvaluations() {
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: getTerms });
  const activeTerm = useMemo(() => terms.find((t: any) => isActive(t.is_active)), [terms]);
  const [termId, setTermId] = useState<string | undefined>();
  const effectiveTermId = termId ?? activeTerm?.id;

  const [tab, setTab] = useState<'rollup' | 'period' | 'questions'>('rollup');

  return (
    <div>
      <PageHeader
        eyebrow="Anonymous · K-anonymity ≥ 3"
        title="Faculty evaluations"
        subtitle="Aggregate evaluation results across the institution. Per-faculty means are hidden when responses fall below the configured threshold."
      />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Chip active={tab === 'rollup'}    onClick={() => setTab('rollup')}>Rollup</Chip>
        <Chip active={tab === 'period'}    onClick={() => setTab('period')}>Period</Chip>
        <Chip active={tab === 'questions'} onClick={() => setTab('questions')}>Question bank</Chip>
        <select
          value={effectiveTermId ?? ''}
          onChange={e => setTermId(e.target.value || undefined)}
          className="input max-w-xs ml-auto"
        >
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}{isActive(t.is_active) ? ' (active)' : ''}</option>
          ))}
        </select>
      </div>

      {tab === 'rollup'    && effectiveTermId && <RollupTab termId={effectiveTermId} />}
      {tab === 'period'    && effectiveTermId && <PeriodTab termId={effectiveTermId} />}
      {tab === 'questions' && <QuestionsTab />}
    </div>
  );
}

// ─── Rollup ────────────────────────────────────────────────────────────────

function RollupTab({ termId }: { termId: string }) {
  const { data, isLoading } = useQuery<AdminEvalRollup>({
    queryKey: ['admin-eval-rollup', termId],
    queryFn:  () => getAdminEvalRollup(termId),
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  if (data.faculty.length === 0) {
    return <div className="card p-0"><EmptyState icon="inbox" title="No faculty in this term" /></div>;
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-beige-50 dark:bg-stone-800">
          <tr>
            <th className="table-th">Faculty</th>
            <th className="table-th text-center" style={{ width: 100 }}>Sections</th>
            <th className="table-th text-center" style={{ width: 100 }}>Responses</th>
            <th className="table-th text-center" style={{ width: 100 }}>Mean</th>
          </tr>
        </thead>
        <tbody>
          {data.faculty.map(f => (
            <tr key={f.facultyId} className="hover:bg-beige-50 dark:hover:bg-stone-800 transition-colors">
              <td className="table-td">
                <div className="text-stone-800 dark:text-stone-100">{f.facultyName}</div>
                {f.userCode && <div className="text-[10px] font-mono text-stone-400 dark:text-stone-500">{f.userCode}</div>}
              </td>
              <td className="table-td text-center tabular">{f.sections}</td>
              <td className="table-td text-center tabular">{f.responses}</td>
              <td className="table-td text-center tabular font-semibold">
                {f.mean != null
                  ? <span className="text-olive-600 dark:text-olive-200">{f.mean.toFixed(2)}</span>
                  : <span className="badge badge-amber" title={`Hidden (n < ${data.minResponseN})`}>
                      <Icon name="shield" size={10} /> hidden
                    </span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Period ────────────────────────────────────────────────────────────────

function PeriodTab({ termId }: { termId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['eval-period', termId],
    queryFn:  () => getEvalPeriod(termId),
    retry:    false,
  });
  const [err, setErr] = useState('');

  const setMut = useMutation({
    mutationFn: (body: any) => setEvalPeriod(termId, body),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Period updated' });
      qc.invalidateQueries({ queryKey: ['eval-period', termId] });
    },
    onError: (e: unknown) => setErr(parseApiError(e).message),
  });

  const [opensAt,  setOpensAt]  = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [minN,     setMinN]     = useState('3');

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="card max-w-2xl">
      {data ? (
        <div className="bg-olive-50 dark:bg-olive-500/15 border border-olive-200 dark:border-olive-400/40 rounded-lg p-3 text-xs text-stone-700 dark:text-stone-200 mb-4">
          <div><strong>Currently set:</strong></div>
          <div>Opens: {new Date(data.opens_at).toLocaleString()}</div>
          <div>Closes: {new Date(data.closes_at).toLocaleString()}</div>
          <div>Min responses for aggregation: <strong>{data.min_response_n}</strong></div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-400/15 border border-amber-200 dark:border-amber-400/40 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-200 mb-4">
          No window set for this term yet. Use <strong>"Auto"</strong> below for the standard 30-day-before-end window.
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={() => { setErr(''); setMut.mutate({ preset: 'auto' }); }}
          disabled={setMut.isPending}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <Icon name="sparkles" size={14} />
          Auto-set: 30 days before term ends, closes 7 days after
        </button>

        <div className="text-[10px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold pt-2">Or override manually</div>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Opens at"  type="datetime-local" value={opensAt}  onChange={e => setOpensAt(e.target.value)} />
          <InputField label="Closes at" type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} />
        </div>
        <InputField
          label="Minimum responses for aggregation (K-anonymity)"
          type="number" min="1" max="50" value={minN}
          onChange={e => setMinN(e.target.value)}
          hint="Below this many responses per section, means + texts are hidden from faculty/admin views."
        />
        {err && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-400/40 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end">
          <button
            className="btn-primary"
            disabled={setMut.isPending || (!opensAt && !closesAt && !minN)}
            onClick={() => {
              setErr('');
              setMut.mutate({
                opensAt:      opensAt  ? new Date(opensAt).toISOString()  : undefined,
                closesAt:     closesAt ? new Date(closesAt).toISOString() : undefined,
                minResponseN: minN ? Number(minN) : undefined,
              });
            }}
          >
            Save overrides
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Question bank ─────────────────────────────────────────────────────────

function QuestionsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['admin-eval-questions'],
    queryFn:  listAdminEvalQuestions,
  });
  const [showCreate, setShowCreate] = useState(false);

  const archiveMut = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => updateEvalQuestion(id, { archived }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-eval-questions'] }),
    onError:   (e: unknown) => toast.push({ tone: 'error', title: 'Update failed', message: parseApiError(e).message }),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;

  const active   = questions.filter((q: EvalQuestion) => !q.archived_at);
  const archived = questions.filter((q: EvalQuestion) =>  q.archived_at);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold">{active.length} active questions</span>
        <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={12} /> New question
        </button>
      </div>

      <div className="space-y-2 mb-6">
        {active.map((q: EvalQuestion) => (
          <QuestionRow key={q.id} q={q} onArchive={() => archiveMut.mutate({ id: q.id, archived: true })} />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold mb-2">
            Archived ({archived.length})
          </h3>
          <div className="space-y-2 opacity-70">
            {archived.map((q: EvalQuestion) => (
              <QuestionRow key={q.id} q={q} archived onRestore={() => archiveMut.mutate({ id: q.id, archived: false })} />
            ))}
          </div>
        </>
      )}

      {showCreate && <CreateQuestionModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function QuestionRow({ q, archived, onArchive, onRestore }: {
  q: EvalQuestion; archived?: boolean; onArchive?: () => void; onRestore?: () => void;
}) {
  return (
    <div className="card !py-3 flex items-start gap-3">
      <span className="font-mono text-[10px] text-stone-400 dark:text-stone-500 font-semibold mt-0.5 w-6 text-right tabular">
        {q.display_order}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-stone-800 dark:text-stone-100">{q.prompt}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mt-1">
          {q.kind === 'likert_5' ? 'Likert 1–5' : 'Free text'}
        </div>
      </div>
      {archived ? (
        <button className="btn-icon" title="Restore" onClick={onRestore}>
          <Icon name="refresh" size={13} />
        </button>
      ) : (
        <button className="btn-icon hover:!text-red-500" title="Archive" onClick={onArchive}>
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  );
}

function CreateQuestionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [kind, setKind]     = useState<'likert_5' | 'text'>('likert_5');
  const [order, setOrder]   = useState('99');
  const [err, setErr]       = useState('');

  const mut = useMutation({
    mutationFn: () => createEvalQuestion({ prompt, kind, displayOrder: Number(order) }),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Question added' });
      qc.invalidateQueries({ queryKey: ['admin-eval-questions'] });
      onClose();
    },
    onError: (e: unknown) => setErr(parseApiError(e).message),
  });

  return (
    <Modal title="New evaluation question" onClose={onClose}>
      <div className="space-y-3">
        <InputField label="Prompt" value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="The instructor explained concepts clearly…" />
        <SelectField label="Kind" value={kind} onChange={e => setKind(e.target.value as any)}>
          <option value="likert_5">Likert 1–5</option>
          <option value="text">Free text</option>
        </SelectField>
        <InputField label="Display order" type="number" min="0" max="999" value={order}
          onChange={e => setOrder(e.target.value)} />
        {err && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-400/40 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={prompt.length < 5 || mut.isPending} onClick={() => { setErr(''); mut.mutate(); }}>
            {mut.isPending ? 'Adding…' : 'Add question'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
