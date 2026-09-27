import React from 'react';
import cn from '../../lib/cn';
import List, { ListRow } from '../../components/ui/List';

/**
 * Console data: a real `<table>` from `sm` up, rows below it (plan.md §28.4).
 *
 * A seven-column table on a phone is either unreadable or a horizontal scroll
 * nobody finds, and a list of cards on a desktop monitor wastes the one thing
 * an operator needs, which is seeing many rows at once. So both are rendered
 * from the same `rows`, and CSS picks one. The table keeps real `<th scope>`
 * headers so a screen reader announces the column with each cell.
 *
 * `columns`: `{ key, header, render(row), className? }`.
 * `mobileRow(row)`: the props for a ListRow — title, subtitle, trailing.
 */
const ResponsiveTable = ({ caption, columns, rows, rowKey = (row) => row._id, onRowClick, mobileRow }) => (
    <>
        <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                        {columns.map((column) => (
                            <th key={column.key} scope="col" className={cn('px-4 py-2.5 font-medium', column.className)}>
                                {column.header}
                            </th>
                        ))}
                        {onRowClick && (
                            <th scope="col" className="px-4 py-2.5">
                                <span className="sr-only">Actions</span>
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                        <tr key={rowKey(row)} className={cn(onRowClick && 'hover:bg-surface-hover')}>
                            {columns.map((column) => (
                                <td key={column.key} className={cn('px-4 py-3 align-middle text-text', column.className)}>
                                    {column.render(row)}
                                </td>
                            ))}
                            {onRowClick && (
                                <td className="px-4 py-3 text-right">
                                    {/* A real button in the last cell rather than an
                                        onClick on the <tr>: a clickable row is not
                                        focusable or announced as a control. */}
                                    <button
                                        type="button"
                                        onClick={() => onRowClick(row)}
                                        className="rounded-control px-2.5 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-soft"
                                    >
                                        Open
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <List className="sm:hidden">
            {rows.map((row) => (
                <ListRow
                    key={rowKey(row)}
                    {...mobileRow(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    showChevron={Boolean(onRowClick)}
                />
            ))}
        </List>
    </>
);

/** Previous/next paging for the `{ total, currentPage|page, totalPages }` list envelope. */
export const Pager = ({ page, totalPages, total, onChange }) => {
    if (!totalPages || totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-text-muted">
            <span>
                Page {page} of {totalPages}
                {typeof total === 'number' && ` · ${total} total`}
            </span>
            <div className="flex gap-1">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onChange(page - 1)}
                    className="rounded-control px-3 py-1.5 font-medium text-text hover:bg-surface-hover disabled:opacity-40"
                >
                    Previous
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onChange(page + 1)}
                    className="rounded-control px-3 py-1.5 font-medium text-text hover:bg-surface-hover disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export default ResponsiveTable;
