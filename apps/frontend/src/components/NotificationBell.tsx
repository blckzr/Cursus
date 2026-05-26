import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import Icon from './Icon';

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Pick an icon + tint per notification kind. Falls back to a neutral bell. */
const KIND_VISUAL: Record<string, { icon: string; tint: string }> = {
  grade_finalized:  { icon: 'award',           tint: 'text-olive-500 bg-olive-50' },
  term_opened:      { icon: 'calendar',        tint: 'text-khaki-600 bg-khaki-50' },
  schedule_changed: { icon: 'clock',           tint: 'text-amber-600 bg-amber-50' },
};

/** Compact relative-time formatter for the dropdown. */
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const qc       = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Poll every 60s so the badge stays roughly fresh without spamming the API.
  const { data } = useQuery({
    queryKey:        ['notifications'],
    queryFn:         () => getNotifications({ limit: 15 }),
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const rows: Notification[] = data?.rows ?? [];
  const unread: number       = data?.unread ?? 0;

  const readMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleRowClick = (n: Notification) => {
    if (!n.read_at) readMut.mutate(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-stone-500 hover:text-olive-600 hover:bg-beige-100 transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-1 tabular leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[92vw] bg-white border border-beige-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-beige-200 bg-beige-50">
            <div className="text-sm font-semibold text-stone-700">Notifications</div>
            {unread > 0 && (
              <button
                onClick={() => readAllMut.mutate()}
                disabled={readAllMut.isPending}
                className="text-xs text-olive-600 hover:text-olive-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto scrollable">
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-stone-400">
                <Icon name="inbox" size={28} className="mx-auto mb-2 text-stone-300" />
                <div className="text-sm font-medium">No notifications yet</div>
                <div className="text-xs text-stone-400 mt-1">You'll see grade updates, schedule changes, and new terms here.</div>
              </div>
            ) : (
              rows.map(n => {
                const visual = KIND_VISUAL[n.kind] ?? { icon: 'bell', tint: 'text-stone-500 bg-beige-100' };
                const isUnread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleRowClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-beige-100 last:border-0 flex items-start gap-3 transition-colors hover:bg-beige-50 ${
                      isUnread ? 'bg-olive-50/40' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${visual.tint}`}>
                      <Icon name={visual.icon} size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`text-sm truncate ${isUnread ? 'font-semibold text-stone-800' : 'font-medium text-stone-600'}`}>
                          {n.title}
                        </div>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-olive-500 flex-shrink-0" />}
                      </div>
                      {n.body && (
                        <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{n.body}</div>
                      )}
                      <div className="text-[10px] text-stone-400 mt-1 uppercase tracking-wider">{timeAgo(n.created_at)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
