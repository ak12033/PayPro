import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import IconBadge from '../../components/ui/IconBadge';
import { useAuth } from '../../context/AuthContext';
import VerifyEmailSheet from './VerifyEmailSheet';

/**
 * "Verify your email before moving money" (plan.md §31.2.7).
 *
 * Renders only on an explicit `emailVerified === false`. While the profile is
 * still loading the field is `undefined`, and flashing an alarm at a verified
 * user for a few hundred milliseconds on every page load would teach them to
 * ignore it.
 *
 * It says what is blocked and what is not. "Verify your email" alone reads as
 * housekeeping; "you can't send or add money until you do" is the reason to act.
 */
const VerifyEmailBanner = ({ className }) => {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);

    if (user?.emailVerified !== false) return null;

    return (
        <>
            <Card padding="md" className={className} role="region" aria-label="Email verification">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <IconBadge icon={<MailCheck size={17} />} tone="warning" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text">Verify your email to move money</p>
                            <p className="mt-0.5 text-xs leading-5 text-text-muted">
                                You can't send or add money until {user.email} is confirmed. Receiving money and
                                everything else works as normal.
                            </p>
                        </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setOpen(true)} className="shrink-0">
                        Enter code
                    </Button>
                </div>
            </Card>
            <VerifyEmailSheet open={open} onClose={() => setOpen(false)} />
        </>
    );
};

export default VerifyEmailBanner;
