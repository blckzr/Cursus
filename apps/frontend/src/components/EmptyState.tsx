import type { ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  icon?: string;
  title?: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon = 'inbox', title, message, action }: Props) {
  return (
    <div className="text-center py-14 px-6">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-beige-100 text-stone-400 items-center justify-center mb-3">
        <Icon name={icon} size={22} />
      </div>
      {title && <p className="text-stone-700 font-medium">{title}</p>}
      {message && <p className="text-sm text-stone-400 mt-1">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
