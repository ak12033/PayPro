import React from 'react';

/**
 * A QR matrix (from `lib/qr`) as an SVG of black squares on a white ground.
 * Shared by the payment code and the authenticator setup sheet.
 *
 * `shapeRendering="crispEdges"` matters: anti-aliased module edges are exactly
 * what makes a small on-screen QR unreadable to a camera.
 */
const QrSvg = ({ matrix, label, size: pixels = 220 }) => {
    const size = matrix.length;
    // A quiet zone is part of the spec, not padding — scanners use it to find
    // the symbol's edges, and a code drawn flush to its container often fails.
    const quiet = 2;
    const total = size + quiet * 2;

    return (
        <svg
            viewBox={`0 0 ${total} ${total}`}
            width={pixels}
            height={pixels}
            shapeRendering="crispEdges"
            role="img"
            aria-label={label}
        >
            <rect width={total} height={total} fill="#fff" />
            {matrix.map((row, y) =>
                row.map((filled, x) =>
                    filled ? (
                        <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1} height={1} fill="#000" />
                    ) : null
                )
            )}
        </svg>
    );
};

export default QrSvg;
