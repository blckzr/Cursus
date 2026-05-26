import type { ReactNode } from 'react';
import Icon from './Icon';

export interface HeaderStat {
  label: string;
  value: ReactNode;
  delta?: string;
  icon?: string;
  tone?: 'olive' | 'amber' | 'red' | 'khaki';
}

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  stats?: HeaderStat[];
  children?: ReactNode;
}

export default function PageHeader({ eyebrow, title, subtitle, action, stats, children }: Props) {
  return (
    <div className="mb-7">
      <div className="flex items-start justify-between gap-6">
        <div>
          {eyebrow && (
            <div className="text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-olive-400 mb-2">
              {eyebrow}
            </div>
          )}
          <h1 className="page-title">{title}</h1>
          {subtitle && (
            typeof subtitle === 'string'
              ? <p className="text-sm text-stone-500 mt-1.5 max-w-xl">{subtitle}</p>
              : <div className="text-sm text-stone-500 mt-1.5">{subtitle}</div>
          )}
        </div>
        {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
      </div>

      {stats && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-khaki-100 p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.7rem] uppercase tracking-wider text-stone-400 font-medium">{s.label}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular text-stone-800">{s.value}</span>
                  {s.delta && <span className="text-xs font-medium text-stone-400">{s.delta}</span>}
                </div>
              </div>
              {s.icon && (
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  s.tone === 'amber' ? 'bg-amber-50 text-amber-600'
                    : s.tone === 'red' ? 'bg-red-50 text-red-500'
                    : s.tone === 'khaki' ? 'bg-khaki-50 text-khaki-500'
                    : 'bg-olive-50 text-olive-400'
                }`}>
                  <Icon name={s.icon} size={18} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
