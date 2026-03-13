'use client';

import {
  Column,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';

function getMobileColumnLabel<TData>(column: Column<TData, unknown>) {
  const header = column.columnDef.header;

  if (typeof header === 'string') {
    return header;
  }

  return column.id === 'actions' ? 'Ações' : column.id;
}

export function DataTable<TData>({
  columns,
  data,
  onRowClick,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
}) {
  // TanStack Table exposes imperative helpers that trigger this React Compiler warning.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-[28px] border border-border">
      <div className="space-y-3 p-3 md:hidden">
        {table.getRowModel().rows.map((row) => {
          const visibleCells = row.getVisibleCells();
          const primaryCell = visibleCells.find((cell) => cell.column.id !== 'actions') ?? visibleCells[0];
          const secondaryCells = visibleCells.filter(
            (cell) => cell.id !== primaryCell?.id && cell.column.id !== 'actions',
          );
          const actionsCell = visibleCells.find((cell) => cell.column.id === 'actions');

          return (
            <div
              key={row.id}
              className={cn(
                'rounded-[24px] border border-border bg-white/[0.03] p-4 shadow-[0_12px_28px_rgba(2,10,22,0.14)] transition',
                onRowClick ? 'cursor-pointer active:scale-[0.995]' : '',
              )}
              onClick={() => onRowClick?.(row.original)}
            >
              {primaryCell ? (
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    {getMobileColumnLabel(primaryCell.column)}
                  </p>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
                  </div>
                </div>
              ) : null}

              {secondaryCells.length ? (
                <div className="mt-4 grid gap-3 min-[360px]:grid-cols-2">
                  {secondaryCells.map((cell) => (
                    <div key={cell.id} className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                        {getMobileColumnLabel(cell.column)}
                      </p>
                      <div className="text-sm text-foreground/88">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {actionsCell ? (
                <div className="mt-4 border-t border-border/70 pt-3">
                  <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-white/[0.03]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium text-muted-foreground">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-t border-border/70 transition hover:bg-white/[0.03]',
                  onRowClick ? 'cursor-pointer' : '',
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle text-foreground/90">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
