import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMyAppeals, withdrawAppeal, type AppealRow } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import AppealCard from '../../components/AppealCard';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

export default function StudentAppeals() {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: appeals = [], isLoading } = useQuery<AppealRow[]>({
    queryKey: ['my-appeals'],
    queryFn:  listMyAppeals,
  });

  const withdrawMut = useMutation({
    mutationFn: () => withdrawAppeal(confirmId!),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['my-appeals'] });
      setConfirmId(null);
      toast.push({ tone: 'info', title: 'Appeal withdrawn' });
    },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Could not withdraw', message: parseApiError(e).message }),
  });

  const active   = appeals.filter(a => a.status !== 'resolved' && a.status !== 'withdrawn');
  const finished = appeals.filter(a => a.status === 'resolved' || a.status === 'withdrawn');

  return (
    <div>
      <PageHeader
        eyebrow="Academic record"
        title="My grade appeals"
        subtitle="Track every appeal you've filed. You can withdraw an active appeal at any time before it's resolved."
      />

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : appeals.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="clipboard-list"
            title="No appeals yet"
            message="If you believe a final grade was recorded incorrectly, file an appeal from the My Grades page within 14 days of finalization."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <Section title="Active" count={active.length}>
              {active.map(a => (
                <AppealCard
                  key={a.id}
                  appeal={a}
                  actions={
                    <button
                      className="btn-ghost text-xs flex items-center gap-1.5 border border-stone-200 hover:!text-red-500"
                      onClick={() => setConfirmId(a.id)}
                    >
                      <Icon name="x" size={11} /> Withdraw
                    </button>
                  }
                />
              ))}
            </Section>
          )}
          {finished.length > 0 && (
            <Section title="History" count={finished.length}>
              {finished.map(a => <AppealCard key={a.id} appeal={a} />)}
            </Section>
          )}
        </div>
      )}

      {confirmId && (
        <Modal
          title="Withdraw your appeal?"
          subtitle="This action is final — you can't re-submit an appeal for the same grade after withdrawing."
          onClose={() => setConfirmId(null)}
        >
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
              <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
              <span>The faculty and/or dean will be notified that you've withdrawn the appeal. Your original grade stays.</span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setConfirmId(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => withdrawMut.mutate()} disabled={withdrawMut.isPending}>
                {withdrawMut.isPending ? 'Withdrawing…' : 'Yes, withdraw'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-[0.08em]">{title}</h2>
        <span className="text-[10px] font-semibold text-stone-400">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
