import type { ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  tone?: 'olive' | 'amber' | 'red' | 'khaki';
  children?: ReactNode;
}

export default function StatTile({ label, value, hint, icon, tone = 'olive', children }: Props) {
  const toneCls = tone === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100'
    : tone === 'red' ? 'bg-red-50 text-red-500 border-red-100'
    : tone === 'khaki' ? 'bg-khaki-50 text-khaki-500 border-khaki-100'
    : 'bg-olive-50 text-olive-500 border-olive-100';
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.7rem] uppercase tracking-wider text-stone-400 font-medium">{label}</div>
          <div className="text-2xl font-semibold tabular text-stone-800 mt-1.5 leading-none">{value}</div>
          {hint && <div className="text-xs text-stone-500 mt-2">{hint}</div>}
        </div>
        {icon && (
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center border ${toneCls}`}>
            <Icon name={icon} size={17} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
