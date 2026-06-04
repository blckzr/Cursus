import { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon from './Icon';

/**
 * Per-column responsive hiding. Setting `hideBelow: 'sm'` collapses the column
 * on viewports narrower than the Tailwind `sm` breakpoint (640 px). The page
 * is responsible for adding a matching `cellHideClass(...)` to the cell so
 * `<th>` and `<td>` counts stay aligned.
 */
export type HideBelow = 'sm' | 'md' | 'lg';

export interface DataTableHeader {
  label: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  hideBelow?: HideBelow;
}

interface Props {
  headers: DataTableHeader[];
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Enables client-side pagination. When set, the table slices children to
   * `pageSize` rows per page and renders prev/next controls. Omit (or set 0)
   * to render every row at once — the historical behaviour.
   */
  pageSize?: number;
}

/** Class string a page should apply to its `<td>` to mirror a header's `hideBelow`. */
export const cellHideClass = (b?: HideBelow) =>
  b === 'sm' ? 'hidden sm:table-cell'
  : b === 'md' ? 'hidden md:table-cell'
  : b === 'lg' ? 'hidden lg:table-cell'
  : '';

export default function DataTable({ headers, children, footer, pageSize }: Props) {
  // Flatten React children into an array so we can slice for pagination.
  // Children.toArray gives every child a stable `.key`, which is what React
  // expects from a list anyway.
  const rows = useMemo(() => Children.toArray(children), [children]);
  const total = rows.length;

  // Pagination kicks in only when the caller asked for it AND there's more
  // than one page's worth of data — otherwise the controls are noise.
  const paginated = !!pageSize && pageSize > 0 && total > pageSize;
  const totalPages = paginated ? Math.ceil(total / pageSize!) : 1;

  const [page, setPage] = useState(0);

  // Whenever the source data shrinks (e.g. the parent applied a filter),
  // clamp the current page so we don't show an empty slice.
  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [page, totalPages]);

  const visible = paginated
    ? rows.slice(page * pageSize!, (page + 1) * pageSize!)
    : rows;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`table-th ${cellHideClass(h.hideBelow)} ${
                    h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : ''
                  }`}
                  style={h.width ? { width: h.width } : undefined}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {footer && (
        <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500">{footer}</div>
      )}
      {paginated && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          pageSize={pageSize!}
          total={total}
          onChange={setPage}
        />
      )}
    </div>
  );
}

// ─── Pagination bar ──────────────────────────────────────────────────────────

function PaginationBar({ page, totalPages, pageSize, total, onChange }: {
  page: number; totalPages: number; pageSize: number; total: number;
  onChange: (p: number) => void;
}) {
  const start = page * pageSize + 1;
  const end   = Math.min((page + 1) * pageSize, total);
  return (
    <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center justify-between gap-3 flex-wrap">
      <span className="tabular">Showing <span className="text-stone-700 font-medium">{start}–{end}</span> of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="chevron-left" size={12} /> Prev
        </button>
        <span className="text-xs tabular text-stone-600">{page + 1} / {totalPages}</span>
        <button
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page + 1 >= totalPages}
          className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <Icon name="chevron-right" size={12} />
        </button>
      </div>
    </div>
  );
}
