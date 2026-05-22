import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBlocks, promoteYear } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
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
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : blocks.length === 0 ? (
        <div className="card p-0"><EmptyState icon="boxes" title="No blocks yet" message="Create a program to generate its blocks." /></div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([programId, prog]) => {
            const maxYear = Math.max(...prog.years.keys());
            return (
              <div key={programId} className="card">
                <h2 className="text-lg font-semibold text-stone-800">
                  <span className="font-mono text-olive-500">{prog.code}</span>
                  <span className="text-stone-400 font-normal"> — {prog.name}</span>
                </h2>

                <div className="space-y-3 mt-4">
                  {[...prog.years.keys()].sort((a, b) => a - b).map(year => {
                    const yearBlocks = prog.years.get(year)!.sort((a, b) => a.block_number - b.block_number);
                    const total = yearBlocks.reduce((s, b) => s + b.student_count, 0);
                    return (
                      <div key={year} className="border border-beige-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-stone-700">
                            Year {year}
                            <span className="text-stone-400 text-sm ml-2">{total} student{total === 1 ? '' : 's'}</span>
                          </span>
                          {year < maxYear && (
                            <button
                              className="btn-secondary text-xs"
                              disabled={promoteMut.isPending || total === 0}
                              onClick={() => {
                                if (window.confirm(
                                  `Promote all ${total} Year ${year} student(s) of ${prog.code} to Year ${year + 1} and randomly reshuffle their blocks?`,
                                )) promoteMut.mutate({ programId, yearLevel: year });
                              }}
                            >
                              Promote to Year {year + 1} →
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {yearBlocks.map(b => {
                            const full = b.student_count >= b.capacity;
                            return (
                              <div
                                key={b.id}
                                className={`px-3 py-2 rounded-lg border text-sm ${
                                  full ? 'border-red-200 bg-red-50' : 'border-beige-200 bg-beige-50'
                                }`}
                              >
                                <span className="font-mono font-semibold text-olive-600">
                                  {prog.code} {year}-{b.block_number}
                                </span>
                                <span className={`ml-2 ${full ? 'text-red-500' : 'text-stone-500'}`}>
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
    </div>
  );
}
