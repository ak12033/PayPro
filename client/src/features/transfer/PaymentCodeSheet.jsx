import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import ErrorState from '../../components/feedback/ErrorState';
import useQuery from '../../hooks/useQuery';
import { payeeApi } from '../../services/api/endpoints/payeeApi';
import { toQrMatrix } from '../../lib/qr';
import QrSvg from '../../components/ui/QrSvg';

/**
 * "Scan to pay me" (plan.md §9.3).
 *
 * The code is short-lived and signed server-side, and this sheet shows the
 * countdown rather than hiding it — a QR that silently stops working is worse
 * than one that says when it will. It refreshes on demand, not automatically:
 * regenerating under someone who is mid-scan is the one thing guaranteed to
 * make a code fail at the moment it is being used.
 *
 * The matrix is rendered as inline SVG by `lib/qr` — no QR dependency, and no
 * third-party image service, which would mean posting a code identifying this
 * account to someone else's server.
 */
const PaymentCodeSheet = ({ open, onClose }) => {
    const code = useQuery(async () => (await payeeApi.getPaymentCode()).data, { enabled: open });
    const [secondsLeft, setSecondsLeft] = useState(0);

    useEffect(() => {
        if (!open || !code.data?.expiresAt) return undefined;

        const tick = () => {
            const remaining = Math.max(
                0,
                Math.round((new Date(code.data.expiresAt) - Date.now()) / 1000)
            );
            setSecondsLeft(remaining);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [open, code.data]);

    const matrix = useMemo(
        () => (code.data?.code ? toQrMatrix(code.data.code) : null),
        [code.data]
    );

    const expired = secondsLeft <= 0 && Boolean(code.data);

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Scan to pay me"
            description="Show this to someone on PayPro. They'll still choose the amount and confirm it themselves."
            size="sm"
        >
            <div className="flex flex-col items-center gap-4 py-2">
                {code.loading && <Spinner />}

                {code.error && <ErrorState message={code.error} onRetry={code.retry} />}

                {matrix && (
                    <>
                        <div
                            className={`rounded-card bg-white p-4 transition-opacity ${expired ? 'opacity-30' : ''}`}
                        >
                            <QrSvg matrix={matrix} label="Your PayPro payment code, as a QR code" />
                        </div>

                        <p className="text-center text-sm text-text-muted" aria-live="polite">
                            {expired
                                ? 'This code has expired.'
                                : `Expires in ${secondsLeft}s`}
                        </p>

                        <Button
                            variant={expired ? 'primary' : 'secondary'}
                            size="sm"
                            icon={<RefreshCcw size={14} />}
                            onClick={code.retry}
                            loading={code.refreshing}
                        >
                            {expired ? 'Get a new code' : 'Refresh'}
                        </Button>
                    </>
                )}

                <p className="text-center text-xs leading-5 text-text-muted">
                    This only tells someone where to send money. It cannot take anything from
                    your account.
                </p>
            </div>
        </Sheet>
    );
};

export default PaymentCodeSheet;
