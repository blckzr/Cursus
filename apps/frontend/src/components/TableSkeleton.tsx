import Skeleton from './Skeleton';
import type { DataTableHeader } from './DataTable';

interface Props {
  headers: DataTableHeader[];
  rows?: number;
}

// Pseudo-random widths varied by (row, column) for natural-feeling shimmer.
const WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-5/6', 'w-3/5', 'w-1/3'];

export default function TableSkeleton({ headers, rows = 6 }: Props) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`table-th ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : ''}`}
                  style={h.width ? { width: h.width } : undefined}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {headers.map((_, c) => (
                  <td key={c} className="table-td">
                    <Skeleton className={`h-4 ${WIDTHS[(r * 3 + c) % WIDTHS.length]}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
