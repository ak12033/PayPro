import React from 'react';
import { Wifi } from 'lucide-react';
import cn from '../../lib/cn';
import Amount from '../../components/ui/Amount';
import { usePointerTilt } from '../../hooks/usePointerTilt';
import { APP_NAME } from '../../constants/app';

/**
 * A card-shaped presentation of the wallet, for screens about putting money
 * into it — chip, contactless icon, gradient faceplate, tilt-on-hover.
 *
 * There is no card number, expiry or CVV anywhere in this component, and
 * that's deliberate rather than an omission: PayPro moves money through a
 * wallet balance, not a stored card, so a masked "•••• 9482" would be an
 * invented number with nothing behind it. This shows the two facts that are
 * actually real — whose wallet it is, and how much is in it.
 *
 * The faceplate is a fixed dark gradient regardless of the app's own theme,
 * the same way a physical card's plastic doesn't change with your phone's
 * dark mode — so text here is hardcoded white/opacity rather than the
 * semantic `text-*` tokens the rest of the product uses.
 */
const WalletCard = ({ userName, balanceMinor, className }) => {
    const { ref } = usePointerTilt({ maxDeg: 5 });

    return (
        <div
            ref={ref}
            className={cn(
                'relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-panel p-5',
                'border border-white/10 shadow-raised',
                'bg-gradient-to-br from-[var(--pp-slate-900)] via-[var(--pp-blue-900)] to-[var(--pp-slate-950)]',
                'transition-transform duration-[--duration-fast] ease-[--ease-in-out]',
                className
            )}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-2xl"
                style={{ backgroundColor: 'var(--pp-blue-500)', opacity: 0.25 }}
            />

            <div className="relative z-10 flex items-center justify-between">
                <span className="text-sm font-bold tracking-widest text-white">
                    {APP_NAME.toUpperCase()}
                </span>
                <span className="text-2xs font-mono uppercase tracking-wider text-white/50">
                    Digital wallet
                </span>
            </div>

            <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-8 w-11 items-center justify-center rounded-md border border-[var(--pp-amber-500)]/40 bg-gradient-to-r from-[var(--pp-amber-100)] to-[var(--pp-amber-500)] shadow-inner">
                    <div className="h-px w-full bg-[var(--pp-amber-700)]/60" />
                </div>
                <Wifi size={18} className="rotate-90 text-white/40" aria-hidden="true" />
            </div>

            <div className="relative z-10">
                <p className="text-2xs uppercase tracking-wider text-white/50">Available balance</p>
                <Amount minor={balanceMinor} size="lg" tone="neutral" className="!text-white" />
            </div>

            <div className="relative z-10">
                <p className="text-2xs uppercase tracking-wider text-white/40">Wallet holder</p>
                <p className="mt-0.5 text-xs font-medium uppercase text-white/90">
                    {userName || APP_NAME}
                </p>
            </div>
        </div>
    );
};

export default WalletCard;
