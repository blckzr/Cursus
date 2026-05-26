import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Icon from './Icon';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  tone?: ToastTone;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastCtxValue {
  push: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastCtx = createContext<ToastCtxValue>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev, { id, ...toast }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), toast.duration || 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {items.map(t => {
          const tone = t.tone || 'success';
          const toneCls = tone === 'error' ? 'border-red-300 bg-white text-red-700'
            : tone === 'info' ? 'border-khaki-200 bg-white text-stone-700'
            : 'border-olive-200 bg-white text-stone-700';
          const iconName = tone === 'error' ? 'alert-triangle' : tone === 'info' ? 'info' : 'check';
          const iconTone = tone === 'error' ? 'text-red-500' : tone === 'info' ? 'text-khaki-500' : 'text-olive-400';
          return (
            <div
              key={t.id}
              className={`toast pointer-events-auto shadow-pop border ${toneCls} rounded-xl px-4 py-3 min-w-[260px] flex items-start gap-3`}
            >
              <span className={`mt-0.5 ${iconTone}`}><Icon name={iconName} size={16} /></span>
              <div className="text-sm">
                <div className="font-medium">{t.title}</div>
                {t.message && <div className="text-stone-500 text-xs mt-0.5">{t.message}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
