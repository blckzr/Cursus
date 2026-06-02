import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBlocks, promoteYear, graduateBlock } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';

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

  const promoteMut = useMutation({
    mutationFn: ({ programId, yearLevel }: { programId: string; yearLevel: number }) =>
      promoteYear(programId, yearLevel),
    onSuccess: (res: { promoted: number; nextYear: number }) => {
      qc.invalidateQueries({ queryKey: ['blocks'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.push({
        tone: res.promoted === 0 ? 'info' : 'success',
        title: res.promoted === 0 ? 'Nothing to promote' : `Promoted ${res.promoted} student(s)`,
        message: res.promoted === 0
          ? 'No active students for that year.'
          : `Moved to Year ${res.nextYear} and reshuffled their blocks.`,
      });
    },
    onError: (e: unknown) => toast.push({
      tone: 'error',
      title: 'Promotion failed',
      message: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '',
    }),
  });

  const graduateMut = useMutation({
    mutationFn: (blockId: string) => graduateBlock(blockId),
    onSuccess: (res: { graduated: number; blockLabel?: string }) => {
      qc.invalidateQueries({ queryKey: ['blocks'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.push({
        tone: res.graduated === 0 ? 'info' : 'success',
        title: res.graduated === 0 ? 'Nothing to graduate' : `Graduated ${res.graduated} student(s)`,
        message: res.graduated === 0
          ? 'No active students remain in this block.'
          : `${res.blockLabel ?? 'Block'} cohort marked as graduated.`,
      });
    },
    onError: (e: unknown) => toast.push({
      tone: 'error',
      title: 'Graduation failed',
      message: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '',
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
            return (
              <div key={programId} className="card">
                <h2 className="text-base sm:text-lg font-semibold text-stone-800 break-words">
                  <span className="font-mono text-olive-500">{prog.code}</span>
                  <span className="text-stone-400 font-normal"> — {prog.name}</span>
                </h2>

                <div className="space-y-3 mt-4">
                  {[...prog.years.keys()].sort((a, b) => a - b).map(year => {
                    const yearBlocks = prog.years.get(year)!.sort((a, b) => a.block_number - b.block_number);
                    const total = yearBlocks.reduce((s, b) => s + b.student_count, 0);
                    return (
                      <div key={year} className="border border-beige-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                          <span className="font-medium text-stone-700 inline-flex items-center gap-2 flex-wrap">
                            <span>Year {year}</span>
                            {year === maxYear && (
                              <span className="badge badge-completed text-[10px]"><Icon name="award" size={10} /> Final year</span>
                            )}
                            <span className="text-stone-400 text-sm">{total} student{total === 1 ? '' : 's'}</span>
                          </span>
                          {year < maxYear && (
                            <button
                              className="btn-secondary text-xs whitespace-nowrap"
                              disabled={promoteMut.isPending || total === 0}
                              onClick={() => {
                                if (window.confirm(
                                  `Promote all ${total} Year ${year} student(s) of ${prog.code} to Year ${year + 1} and randomly reshuffle their blocks?`,
                                )) promoteMut.mutate({ programId, yearLevel: year });
                              }}
                            >
                              <span className="hidden sm:inline">Promote to Year {year + 1} →</span>
                              <span className="sm:hidden">Promote →</span>
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {yearBlocks.map(b => {
                            const full = b.student_count >= b.capacity;
                            const isFinal = year === maxYear;
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
                                {isFinal && b.student_count > 0 && (
                                  <button
                                    className="ml-1 text-[10px] font-semibold text-olive-600 hover:text-olive-700 hover:underline disabled:opacity-50 disabled:no-underline"
                                    disabled={graduateMut.isPending}
                                    onClick={() => {
                                      if (window.confirm(
                                        `Graduate all ${b.student_count} active student(s) of ${prog.code} ${year}-${b.block_number}? ` +
                                        `They'll be marked inactive and their transcripts will be preserved.`,
                                      )) graduateMut.mutate(b.id);
                                    }}
                                  >
                                    <Icon name="award" size={10} className="inline mr-0.5" />
                                    Graduate
                                  </button>
                                )}
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
    </div>
  );
}
