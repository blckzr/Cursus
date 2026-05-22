import { ReactNode, useEffect } from 'react';
import Icon from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ title, subtitle, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const maxW = size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 backdrop-blur-sm modal-backdrop p-4"
      onClick={onClose}
    >
      <div
        className={`modal-card bg-white rounded-2xl shadow-pop w-full ${maxW} max-h-[88vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-beige-200 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-stone-800">{title}</h3>
            {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto scrollable">{children}</div>
      </div>
    </div>
  );
}
