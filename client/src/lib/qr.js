import QRCode from 'qrcode';

/**
 * QR encoding for payment codes (plan.md §9.3).
 *
 * ---------------------------------------------------------------------------
 * Why a dependency here, when §9.3 says "no new dependency"
 * ---------------------------------------------------------------------------
 * That line is about the *scanner*, and it still holds: `QrScanner.jsx` uses
 * `getUserMedia` + `BarcodeDetector` and falls back to manual entry, with
 * nothing added. Generation is the other direction and is not the same
 * problem. A QR encoder is Reed-Solomon error correction, block interleaving,
 * eight mask patterns with penalty scoring, and format/version bit strings —
 * and a subtly wrong implementation does not fail loudly. It renders something
 * that looks exactly like a QR code and that no camera can read, which is a
 * defect a reviewer cannot catch by looking at it.
 *
 * `qrcode` is the long-standing implementation of that spec. What it must not
 * become is a way to send this data anywhere: the encoding happens in the
 * browser, and a payment code — which identifies this account — never reaches a
 * third-party image service. That constraint is the reason no hosted QR
 * endpoint was used instead.
 */

/**
 * Encode `text` as a boolean matrix, one entry per module.
 *
 * Error-correction level M (~15% recovery) rather than L: these codes are read
 * off a phone screen at an angle, often with a fingerprint on the glass, and
 * the extra redundancy costs a slightly denser symbol for a meaningfully better
 * scan rate. Not Q or H — those push the payload into a larger version, and
 * more modules in the same physical space is itself harder to scan.
 *
 * @returns {boolean[][]|null} row-major matrix, or null if `text` cannot be encoded.
 */
export const toQrMatrix = (text) => {
    if (!text) return null;

    try {
        const { modules } = QRCode.create(String(text), { errorCorrectionLevel: 'M' });
        const { size, data } = modules;

        const matrix = [];
        for (let y = 0; y < size; y += 1) {
            const row = [];
            for (let x = 0; x < size; x += 1) {
                row.push(Boolean(data[y * size + x]));
            }
            matrix.push(row);
        }
        return matrix;
    } catch {
        // An over-long payload is the only realistic failure. Returning null
        // lets the caller show the manual fallback instead of a broken image.
        return null;
    }
};

export default { toQrMatrix };
