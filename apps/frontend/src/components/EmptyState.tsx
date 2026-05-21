import { Inbox } from 'lucide-react';

interface Props { message: string; }

export default function EmptyState({ message }: Props) {
  return (
    <div className="text-center py-16 text-stone-400">
      <Inbox size={40} className="mx-auto mb-3 text-stone-300" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
