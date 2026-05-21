interface Props { message: string; }

export default function EmptyState({ message }: Props) {
  return (
    <div className="text-center py-16 text-stone-400">
      <div className="text-4xl mb-3">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
