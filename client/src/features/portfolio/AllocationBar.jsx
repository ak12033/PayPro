import React from 'react';
import Amount from '../../components/ui/Amount';
import { assetColor, ASSET_LABEL } from './portfolio';

/**
 * Allocation by asset type, as one stacked bar plus a legend list.
 *
 * A part-to-whole of a handful of categories is a bar, not a pie: lengths on a
 * shared baseline compare better than angles. Segments sit on a 2px surface gap
 * so neighbours never merge, each carries a hover title, and the legend below
 * repeats every number in text ink — so the bar is decoration for anyone who
 * cannot see it, never the only place the value lives.
 */
const AllocationBar = ({ allocation = [] }) => {
    if (!allocation.length) return null;
    const shown = allocation.filter((a) => a.percent > 0);

    return (
        <div>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-pill" aria-hidden="true">
                {shown.map((a) => (
                    <div
                        key={a.assetType}
                        className="h-full first:rounded-l-pill last:rounded-r-pill"
                        style={{ width: `${Math.max(a.percent, 1)}%`, backgroundColor: assetColor(a.assetType) }}
                        title={`${ASSET_LABEL[a.assetType]}: ${a.percent}%`}
                    />
                ))}
            </div>
            <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Allocation by asset type</caption>
                <thead className="sr-only">
                    <tr><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Share</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {allocation.map((a) => (
                        <tr key={a.assetType}>
                            <th scope="row" className="py-2 text-left font-normal text-text">
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: assetColor(a.assetType) }} aria-hidden="true" />
                                    {ASSET_LABEL[a.assetType] ?? a.assetType}
                                </span>
                            </th>
                            <td className="py-2 text-right"><Amount minor={a.valueMinor} size="sm" /></td>
                            <td className="w-16 py-2 text-right tabular-nums text-text-muted">{a.percent}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AllocationBar;
