import Skeleton from './Skeleton';

interface Props {
  count?: number;
  cols?: 2 | 3;
}

export default function CardGridSkeleton({ count = 6, cols = 3 }: Props) {
  const colCls = cols === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`grid gap-3 ${colCls}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="w-5 h-5 rounded-full" />
          </div>
          <div className="pt-3 border-t border-beige-200 grid grid-cols-3 gap-2">
            {[0, 1, 2].map(j => <Skeleton key={j} className="h-8" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
