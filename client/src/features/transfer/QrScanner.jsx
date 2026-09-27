import React, { useEffect, useRef, useState } from 'react';
import { Camera, KeyRound } from 'lucide-react';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import Field, { Input } from '../../components/ui/Field';

/**
 * Scan someone's payment code (plan.md §9.3).
 *
 * Camera via `getUserMedia` + `BarcodeDetector`, **no new dependency** — and
 * that constraint shapes the design rather than being worked around. Safari and
 * Firefox do not ship `BarcodeDetector`, so roughly half of real users cannot
 * scan at all; the manual-entry path is therefore not a fallback bolted on at
 * the end but a first-class way to use this sheet. It is what renders when the
 * camera is unavailable, refused, or simply not working.
 *
 * Scanning resolves a recipient and nothing more. The amount, the confirmation,
 * the limits and the risk checks all still happen afterwards — a scanned code
 * can no more move money than a typed-in name can.
 */
const QrScanner = ({ open, onClose, onResolved, resolving }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [cameraState, setCameraState] = useState('idle');
    const [manualCode, setManualCode] = useState('');

    const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    useEffect(() => {
        if (!open || !supported) return undefined;

        let cancelled = false;
        let detector;
        let frameTimer;

        const stop = () => {
            cancelled = true;
            clearTimeout(frameTimer);
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };

        const scanFrame = async () => {
            if (cancelled || !videoRef.current) return;
            try {
                const results = await detector.detect(videoRef.current);
                if (results.length > 0 && results[0].rawValue) {
                    stop();
                    onResolved(results[0].rawValue);
                    return;
                }
            } catch {
                // A detect() failure on one frame is normal — the frame may not
                // be decodable yet. Keep going rather than tearing down the
                // camera the user just granted.
            }
            // ~4 fps: enough to feel instant, far cheaper than every frame.
            frameTimer = setTimeout(scanFrame, 250);
        };

        const start = async () => {
            setCameraState('starting');
            try {
                // The rear camera is what someone points at another phone.
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                detector = new BarcodeDetector({ formats: ['qr_code'] });
                setCameraState('scanning');
                scanFrame();
            } catch {
                // Permission refused, no camera, or a device already in use.
                // All three mean the same thing to the user: type it instead.
                setCameraState('unavailable');
            }
        };

        start();
        return stop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, supported]);

    const showManual = !supported || cameraState === 'unavailable';

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Scan a payment code"
            description="Point your camera at someone's PayPro code. You'll choose the amount next."
            size="sm"
        >
            <div className="space-y-4">
                {!showManual && (
                    <div className="overflow-hidden rounded-card bg-surface-sunken">
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            className="aspect-square w-full object-cover"
                            aria-label="Camera preview"
                        />
                    </div>
                )}

                {cameraState === 'starting' && !showManual && (
                    <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
                        <Camera size={15} aria-hidden="true" />
                        Starting the camera…
                    </p>
                )}

                {showManual && (
                    <>
                        <p className="flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-xs leading-5 text-text-muted">
                            <KeyRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span>
                                {supported
                                    ? "We couldn't use the camera. Paste the code instead."
                                    : "This browser can't scan QR codes. Paste the code instead — ask the other person to copy it from their Scan to pay me screen."}
                            </span>
                        </p>

                        <Field label="Payment code">
                            {(props) => (
                                <Input
                                    {...props}
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    placeholder="Paste the code here"
                                />
                            )}
                        </Field>

                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={() => onResolved(manualCode.trim())}
                            loading={resolving}
                            disabled={!manualCode.trim()}
                        >
                            Continue
                        </Button>
                    </>
                )}

                <p className="text-center text-xs leading-5 text-text-muted">
                    Scanning only fills in who you're paying. You still choose the amount and confirm it.
                </p>
            </div>
        </Sheet>
    );
};

export default QrScanner;
