import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

type Props<T> = {
  columns: ColumnDef<T, any>[];
  data: T[];
  initialSort: SortingState;
};

export function SortableTable<T>({ columns, data, initialSort }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="results">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => {
              const sorted = h.column.getIsSorted();
              const ariaSort: "ascending" | "descending" | "none" =
                sorted === "asc"
                  ? "ascending"
                  : sorted === "desc"
                    ? "descending"
                    : "none";
              return (
                <th
                  key={h.id}
                  scope="col"
                  aria-sort={ariaSort}
                  onClick={h.column.getToggleSortingHandler()}
                  style={{
                    cursor: h.column.getCanSort() ? "pointer" : "default",
                  }}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[sorted as string] ?? null}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
