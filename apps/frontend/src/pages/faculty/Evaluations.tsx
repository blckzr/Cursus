/**
 * Faculty → Evaluations
 *
 * K-anonymous rollup of the calling faculty's evaluation results for one term.
 * Per-question means + 1–5 distributions + a shuffled list of free-text
 * answers. Sections below the configured response threshold render as
 * "needs more responses" — no numbers leak.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFacultyEvalRollup, getTerms, type FacultyEvalRollup } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';

const isActive = (v: unknown) => v === true || v === 'true';

export default function FacultyEvaluations() {
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: getTerms });
  const activeTerm = useMemo(() => terms.find((t: any) => isActive(t.is_active)), [terms]);
  const [termId, setTermId] = useState<string | undefined>();

  const effectiveTermId = termId ?? activeTerm?.id;
  const { data, isLoading } = useQuery<FacultyEvalRollup>({
    queryKey: ['faculty-eval-rollup', effectiveTermId],
    queryFn:  () => getFacultyEvalRollup(effectiveTermId!),
    enabled:  !!effectiveTermId,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Anonymous · Aggregated"
        title="Your evaluation results"
        subtitle={data
          ? `Term mean ${data.termMean != null ? data.termMean.toFixed(2) : '—'} / 5 across ${data.termResponses} response${data.termResponses === 1 ? '' : 's'} · K-anonymity ≥ ${data.minResponseN}`
          : 'Pick a term to view your aggregate evaluation rollup.'}
      />

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <select
          value={effectiveTermId ?? ''}
          onChange={e => setTermId(e.target.value || undefined)}
          className="input max-w-xs"
        >
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}{isActive(t.is_active) ? ' (active)' : ''}</option>
          ))}
        </select>
      </div>

      {!effectiveTermId ? (
        <div className="card p-0"><EmptyState icon="calendar" title="No term selected" message="Pick a term above." /></div>
      ) : isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : data.sections.length === 0 ? (
        <div className="card p-0"><EmptyState icon="inbox" title="No sections in this term" message="You weren't assigned any sections during this term." /></div>
      ) : (
        <div className="space-y-4">
          {data.sections.map(sec => (
            <SectionCard key={sec.sectionId} section={sec} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({ section }: { section: FacultyEvalRollup['sections'][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card !p-0 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-beige-50 dark:hover:bg-stone-800 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-olive-100 dark:bg-olive-500/30 text-olive-600 dark:text-olive-100 flex items-center justify-center flex-shrink-0">
          <Icon name="award" size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-mono text-xs font-semibold text-olive-500 dark:text-olive-200 flex-shrink-0">{section.courseCode}</span>
            <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">{section.courseTitle}</span>
          </div>
          <div className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider">{section.sectionCode}</div>
        </div>
        {section.meetsThreshold ? (
          <span className="badge badge-completed">{section.responses} responses</span>
        ) : (
          <span className="badge badge-amber" title={`Needs ${section.minResponseN}+ to display`}>
            <Icon name="shield" size={10} /> hidden (n={section.responses})
          </span>
        )}
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} className="text-stone-400 dark:text-stone-500 ml-1" />
      </button>

      {expanded && (
        <div className="border-t border-beige-200 dark:border-stone-700 px-4 py-4 space-y-4">
          {!section.meetsThreshold ? (
            <div className="text-xs text-stone-500 dark:text-stone-400 bg-amber-50 dark:bg-amber-400/15 border border-amber-200 dark:border-amber-400/30 rounded-lg p-3 flex items-start gap-2">
              <Icon name="shield" size={12} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
              <span>
                <strong>Hidden to protect anonymity.</strong> This section has {section.responses} response{section.responses === 1 ? '' : 's'} —
                the institutional threshold is {section.minResponseN}.
                With too few respondents an individual student could be identified from their score.
              </span>
            </div>
          ) : (
            <>
              {section.questions.map(q => (
                <div key={q.questionId} className="border-b border-beige-100 dark:border-stone-700/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <div className="text-xs text-stone-700 dark:text-stone-200 flex-1">{q.prompt}</div>
                    <div className="font-mono font-semibold text-olive-600 dark:text-olive-200 text-sm tabular flex-shrink-0">
                      {q.mean != null ? q.mean.toFixed(2) : '—'}
                      <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-1">/ 5</span>
                    </div>
                  </div>
                  {q.distribution && q.distribution.length === 5 && (
                    <DistBar dist={q.distribution} />
                  )}
                </div>
              ))}

              {section.texts.length > 0 && (
                <div className="pt-1">
                  <div className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold mb-2">
                    Written feedback (shuffled)
                  </div>
                  <ul className="space-y-2">
                    {section.texts.map((t, i) => (
                      <li key={i} className="text-xs text-stone-600 dark:text-stone-300 bg-beige-50 dark:bg-stone-800 rounded-lg p-3 border border-beige-200 dark:border-stone-700">
                        "{t}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DistBar({ dist }: { dist: number[] }) {
  const total = dist.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex items-end gap-1 h-8">
      {dist.map((c, i) => {
        const pct = (c / total) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="text-[9px] text-stone-400 dark:text-stone-500 tabular">{c}</div>
            <div
              className="w-full bg-olive-300 dark:bg-olive-400/60 rounded-sm"
              style={{ height: `${Math.max(2, pct)}%` }}
              title={`${i + 1}: ${c} (${pct.toFixed(0)}%)`}
            />
            <div className="text-[9px] text-stone-400 dark:text-stone-500 tabular">{i + 1}</div>
          </div>
        );
      })}
    </div>
  );
}
