import type { ReactNode } from 'react';

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
}

/** Class string a page should apply to its `<td>` to mirror a header's `hideBelow`. */
export const cellHideClass = (b?: HideBelow) =>
  b === 'sm' ? 'hidden sm:table-cell'
  : b === 'md' ? 'hidden md:table-cell'
  : b === 'lg' ? 'hidden lg:table-cell'
  : '';

export default function DataTable({ headers, children, footer }: Props) {
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
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer && (
        <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500">{footer}</div>
      )}
    </div>
  );
}
