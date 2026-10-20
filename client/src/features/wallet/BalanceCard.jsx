import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import cn from '../../lib/cn';
import Card from '../../components/ui/Card';
import Button, { IconButton } from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import Amount from '../../components/ui/Amount';
import { ROUTES } from '../../constants/routes';

const STORAGE_KEY = 'paypro-balance-hidden';

/**
 * The balance, and the two things you do with it.
 *
 * This replaces a four-tile stat grid that gave "Current balance", "Total
 * transactions", "Total sent" and "Total received" identical visual weight.
 * Three of those four are lifetime aggregates nobody opens a wallet to check,
 * and the one number that matters — how much can I spend right now — was
 * competing with them for attention in an identical box.
 *
 * The aggregates have not been deleted; they moved to Insights, where
 * historical analysis belongs.
 *
 * Two design decisions worth stating:
 *
 *   Privacy toggle. People check their balance on trains and in queues.
 *   Being able to hide the number without signing out is a real need, and the
 *   preference persists — having to re-hide it on every page load makes the
 *   feature useless.
 *
 *   The balance never renders as ₹0 while loading. A skeleton shows instead.
 *   Flashing a zero balance at someone, even for 200ms, is a small heart
 *   attack, and it was what the old stat tiles did on every dashboard visit.
 */
const BalanceCard = ({ balanceMinor, loading = false }) => {
    const navigate = useNavigate();
    /**
     * Overdrawn (plan.md §4.4). Only a refund processed after the money was
     * spent can put a balance below zero, and the server now says so rather
     * than letting it happen silently. The card has to say so too: the label
     * changes from "Available" to "Amount owed", the reason is stated, and Send
     * is disabled because the server would refuse it anyway. Add money becomes
     * the primary action, since it is the only thing that clears the debt.
     */
    const overdrawn = !loading && balanceMinor < 0;
    const [hidden, setHidden] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    // Announce a balance change politely rather than silently repainting the
    // number — a socket-driven update is otherwise invisible to a screen reader.
    const previous = useRef(balanceMinor);
    const [changed, setChanged] = useState(false);

    useEffect(() => {
        if (previous.current !== balanceMinor && previous.current !== undefined && !loading) {
            setChanged(true);
            const id = setTimeout(() => setChanged(false), 1200);
            previous.current = balanceMinor;
            return () => clearTimeout(id);
        }
        previous.current = balanceMinor;
        return undefined;
    }, [balanceMinor, loading]);

    const toggleHidden = () => {
        setHidden((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                // Non-fatal; the toggle still works for this session.
            }
            return next;
        });
    };

    return (
        <Card variant="glass" className="relative overflow-hidden transition-[scale,box-shadow,border-color] duration-(--duration-normal) ease-(--ease-out) motion-safe:hover:scale-[1.02]">
            {/* Brand hairline — the one place the gradient marks a surface as
                "the" primary figure on the screen, rather than merely elevated.
                The inner div sweeps a soft highlight across it every few
                seconds — a premium detail distinct from `.skeleton`'s loading
                shimmer, confined to this 3px strip rather than the whole card
                so it never reads as "this card is still loading". */}
            <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-gradient-brand">
                <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer-sweep" />
            </div>

            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={cn('text-sm', overdrawn ? 'font-medium text-negative' : 'text-text-muted')}>
                        {overdrawn ? 'Amount owed' : 'Available balance'}
                    </p>

                    <div
                        className="mt-1.5 flex min-h-11 items-center"
                        // Politely, not assertively: a balance change is worth
                        // knowing about but must not interrupt whatever the
                        // user is currently doing.
                        aria-live="polite"
                        aria-atomic="true"
                    >
                        {loading ? (
                            <Skeleton className="h-9 w-40" />
                        ) : hidden ? (
                            <>
                                <span aria-hidden="true" className="text-3xl font-semibold tracking-widest text-text">
                                    ••••••
                                </span>
                                <span className="sr-only">Balance hidden</span>
                            </>
                        ) : (
                            <Amount
                                minor={balanceMinor}
                                size="display"
                                className={cn(changed && 'animate-pop')}
                            />
                        )}
                    </div>
                </div>

                <IconButton
                    label={hidden ? 'Show balance' : 'Hide balance'}
                    size="sm"
                    onClick={toggleHidden}
                    className="-mr-1"
                >
                    {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                </IconButton>
            </div>

            {/*
             * Send and Add, side by side, equal weight.
             *
             * These are the two reasons this product exists. They were
             * previously two entries in a six-item sidebar on desktop and
             * unreachable on mobile.
             *
             * Half the card each on a phone, where they are thumb targets.
             * From `sm` up they size to their label (with a floor so the pair
             * still matches) instead of stretching across a wide card.
             */}
            {overdrawn && (
                <p className="mt-3 rounded-control bg-negative-soft px-3 py-2.5 text-xs leading-5 text-text-secondary">
                    A refund went through after this money had already been spent, so your balance is below zero.
                    Add money to clear it. You can still receive money, but you can't send any until the balance is
                    back above zero.
                </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                <Button
                    variant={overdrawn ? 'secondary' : 'primary'}
                    size="lg"
                    className="sm:min-w-40"
                    icon={<Send size={17} />}
                    disabled={overdrawn}
                    onClick={() => navigate(ROUTES.SEND)}
                >
                    Send
                </Button>
                <Button
                    variant={overdrawn ? 'primary' : 'secondary'}
                    size="lg"
                    className="sm:min-w-40"
                    icon={<Plus size={17} />}
                    onClick={() => navigate(ROUTES.ADD_MONEY)}
                >
                    Add money
                </Button>
            </div>
        </Card>
    );
};

export default BalanceCard;
