import type { ReactNode } from 'react';

interface Props {
  title: string;
  action?: ReactNode;
  tag?: ReactNode;
  className?: string;
}

export default function SectionTitle({ title, action, tag, className = '' }: Props) {
  return (
    <div className={`flex items-end justify-between mb-3 ${className}`}>
      <div className="flex items-center gap-2.5">
        <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-[0.08em]">{title}</h2>
        {tag && <span className="text-[10px] font-semibold text-stone-400">{tag}</span>}
      </div>
      {action}
    </div>
  );
}
