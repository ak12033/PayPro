import React, { useId, useState } from 'react';
import { Table2 } from 'lucide-react';
import cn from '../../lib/cn';

/**
 * The data behind a chart, as a table (plan.md §37.2 requirement 3).
 *
 * A Recharts SVG is a pile of `<path>` elements to a screen reader — the
 * dashboard's time-series charts had no text equivalent at all, so the most
 * prominent numbers on Home were simply absent for anyone not looking at them.
 *
 * Both of the plan's options, because they serve different people:
 *
 *   - the table is **always** in the document. Collapsed, it is `sr-only`, so a
 *     screen-reader user gets the series without having to find a toggle whose
 *     purpose they cannot see;
 *   - "View as table" reveals the same table visually, for a keyboard or
 *     low-vision user who can read a table more easily than hover tooltips —
 *     which a keyboard cannot open at all.
 *
 * The chart it accompanies should be `aria-hidden`, so the table is read once
 * instead of after a stream of unlabelled SVG nodes.
 *
 * `columns`: `{ key, header, render(row) }`; the first column is the row header.
 */
const ChartDataTable = ({ caption, columns, rows, rowKey = (row, index) => row.date ?? index, className }) => {
    const [visible, setVisible] = useState(false);
    const tableId = useId();

    if (!rows?.length) return null;

    return (
        <div className={cn('mt-3', className)}>
            <button
                type="button"
                aria-expanded={visible}
                aria-controls={tableId}
                onClick={() => setVisible((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text"
            >
                <Table2 size={13} aria-hidden="true" />
                {visible ? 'Hide table' : 'View as table'}
            </button>

            <div id={tableId} className={cn(visible ? 'mt-2 max-h-72 overflow-auto rounded-control border border-border' : 'sr-only')}>
                <table className="w-full text-left text-xs">
                    <caption className="sr-only">{caption}</caption>
                    <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-border text-text-muted">
                            {columns.map((column) => (
                                <th key={column.key} scope="col" className="px-3 py-2 font-medium">
                                    {column.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map((row, index) => (
                            <tr key={rowKey(row, index)}>
                                {columns.map((column, columnIndex) =>
                                    columnIndex === 0 ? (
                                        <th key={column.key} scope="row" className="px-3 py-1.5 font-normal text-text-secondary">
                                            {column.render(row)}
                                        </th>
                                    ) : (
                                        <td key={column.key} className="px-3 py-1.5 tabular-nums text-text">
                                            {column.render(row)}
                                        </td>
                                    )
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ChartDataTable;
