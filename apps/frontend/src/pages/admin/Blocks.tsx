import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBlocks, advanceAcademicYear, type AdvanceAyResult } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

interface Block {
  id: string;
  program_id: string;
  program_code: string;
  program_name: string;
  year_level: number;
  block_number: number;
  capacity: number;
  student_count: number;
}

export default function Blocks() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: blocks = [], isLoading } = useQuery<Block[]>({ queryKey: ['blocks'], queryFn: getBlocks });

  const [advanceTarget, setAdvanceTarget] = useState<{ programId: string; code: string; name: string; years: Map<number, Block[]> } | null>(null);

  const advanceMut = useMutation({
    mutationFn: (programId: string) => advanceAcademicYear(programId),
    onSuccess: (res: AdvanceAyResult) => {
      qc.invalidateQueries({ queryKey: ['blocks'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.push({
        tone: 'success',
        title: `${res.programCode} advanced`,
        message: `${res.totalPromoted} promoted · ${res.totalGraduated} graduated.`,
      });
      setAdvanceTarget(null);
    },
    onError: (e: unknown) => toast.push({
      tone: 'error',
      title: 'Advance failed',
      message: parseApiError(e).message,
    }),
  });

  // Group flat block list into program → year level → blocks[]
  const grouped = useMemo(() => {
    const byProgram = new Map<string, { code: string; name: string; years: Map<number, Block[]> }>();
    for (const b of blocks) {
      if (!byProgram.has(b.program_id))
        byProgram.set(b.program_id, { code: b.program_code, name: b.program_name, years: new Map() });
      const prog = byProgram.get(b.program_id)!;
      if (!prog.years.has(b.year_level)) prog.years.set(b.year_level, []);
      prog.years.get(b.year_level)!.push(b);
    }
    return byProgram;
  }, [blocks]);

  return (
    <div>
      <PageHeader
        eyebrow="Cohorts"
        title="Blocks"
        subtitle="Year & program cohort sections — students are auto-assigned on creation."
      />

      {isLoading ? (
        <div className="space-y-6">
          {[0, 1].map(i => (
            <div key={i} className="card space-y-4">
              <Skeleton className="h-5 w-2/3" />
              <div className="space-y-3">
                {[0, 1, 2].map(y => (
                  <div key={y} className="border border-beige-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-6 w-32 rounded-lg" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[0, 1, 2].map(b => <Skeleton key={b} className="h-9 w-28 rounded-lg" />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <div className="card p-0"><EmptyState icon="boxes" title="No blocks yet" message="Create a program to generate its blocks." /></div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([programId, prog]) => {
            const maxYear = Math.max(...prog.years.keys());
            const programTotal = [...prog.years.values()].flat().reduce((s, b) => s + b.student_count, 0);
            return (
              <div key={programId} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <h2 className="text-base sm:text-lg font-semibold text-stone-800 break-words">
                    <span className="font-mono text-olive-500">{prog.code}</span>
                    <span className="text-stone-400 font-normal"> — {prog.name}</span>
                  </h2>
                  <button
                    className="btn-primary text-xs flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
                    disabled={programTotal === 0 || advanceMut.isPending}
                    onClick={() => setAdvanceTarget({ programId, code: prog.code, name: prog.name, years: prog.years })}
                    title="End-of-academic-year batch: promote every year and graduate the final year in one transaction."
                  >
                    <Icon name="sparkles" size={12} />
                    Advance academic year
                  </button>
                </div>

                <div className="space-y-3">
                  {[...prog.years.keys()].sort((a, b) => a - b).map(year => {
                    const yearBlocks = prog.years.get(year)!.sort((a, b) => a.block_number - b.block_number);
                    const total = yearBlocks.reduce((s, b) => s + b.student_count, 0);
                    return (
                      <div key={year} className="border border-beige-200 dark:border-stone-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                          <span className="font-medium text-stone-700 inline-flex items-center gap-2 flex-wrap">
                            <span>Year {year}</span>
                            {year === maxYear && (
                              <span className="badge badge-completed text-[10px]"><Icon name="award" size={10} /> Final year</span>
                            )}
                            <span className="text-stone-400 text-sm">{total} student{total === 1 ? '' : 's'}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {yearBlocks.map(b => {
                            const full = b.student_count >= b.capacity;
                            return (
                              <div
                                key={b.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                  full ? 'border-red-200 bg-red-50' : 'border-beige-200 bg-beige-50'
                                }`}
                              >
                                <span className="font-mono font-semibold text-olive-600">
                                  {prog.code} {year}-{b.block_number}
                                </span>
                                <span className={full ? 'text-red-500' : 'text-stone-500'}>
                                  {b.student_count}/{b.capacity}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {advanceTarget && (
        <AdvanceConfirmModal
          target={advanceTarget}
          isPending={advanceMut.isPending}
          onConfirm={() => advanceMut.mutate(advanceTarget.programId)}
          onClose={() => setAdvanceTarget(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Confirmation modal — shows year-by-year preview before running the txn
// ============================================================================

function AdvanceConfirmModal({ target, isPending, onConfirm, onClose }: {
  target: { programId: string; code: string; name: string; years: Map<number, Block[]> };
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const maxYear = Math.max(...target.years.keys());
  const yearTotals: { year: number; total: number; isFinal: boolean }[] = [...target.years.keys()]
    .sort((a, b) => a - b)
    .map(year => ({
      year,
      total: target.years.get(year)!.reduce((s, b) => s + b.student_count, 0),
      isFinal: year === maxYear,
    }));

  return (
    <Modal
      title={`Advance ${target.code} — end of academic year`}
      subtitle="This runs in one transaction. If any step fails, the whole batch rolls back."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-amber-50 dark:bg-amber-400/15 border border-amber-200 dark:border-amber-400/40 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-1">This cannot be undone from the UI.</div>
            Every non-final year promotes; final-year students become alumni and lose
            access to non-transcript features. Their academic record is preserved forever.
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-semibold">What will happen</div>
          <ul className="space-y-1.5">
            {yearTotals.map(({ year, total, isFinal }) => (
              <li key={year} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-beige-200 dark:border-stone-700 bg-beige-50 dark:bg-stone-800">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isFinal
                    ? 'bg-olive-100 dark:bg-olive-500/30 text-olive-600 dark:text-olive-100'
                    : 'bg-khaki-100 dark:bg-khaki-300/30 text-khaki-600 dark:text-khaki-100'
                }`}>
                  <Icon name={isFinal ? 'award' : 'arrow-up'} size={14} />
                </span>
                <span className="flex-1 text-sm text-stone-700 dark:text-stone-200">
                  <span className="font-semibold">Year {year}</span> →{' '}
                  {isFinal
                    ? <span className="text-olive-600 dark:text-olive-200 font-semibold">Alumni</span>
                    : <span className="text-stone-600 dark:text-stone-300">Year {year + 1}</span>}
                </span>
                <span className="font-mono tabular text-sm font-semibold text-stone-800 dark:text-stone-100 flex-shrink-0">
                  {total} student{total === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending
              ? <><span className="spinner" /> Advancing…</>
              : <><Icon name="sparkles" size={14} /> Run advancement</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
