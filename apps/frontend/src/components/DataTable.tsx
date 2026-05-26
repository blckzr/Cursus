import type { ReactNode } from 'react';

export interface DataTableHeader {
  label: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}

interface Props {
  headers: DataTableHeader[];
  children: ReactNode;
  footer?: ReactNode;
}

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
                  className={`table-th ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : ''}`}
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
