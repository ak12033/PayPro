import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/Field';
import cn from '../../lib/cn';

/**
 * Password input with a visibility toggle.
 *
 * The toggle is a real button with an accessible name that reflects its state,
 * not a "Show"/"Hide" text link. Two consequences that matter: a screen reader
 * user is told what the control does rather than being read the word "Show" out
 * of context, and `aria-pressed` communicates whether the password is currently
 * visible — which is a thing you want to know before typing in public.
 */
const PasswordField = React.forwardRef(function PasswordField({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
        <div className={cn('relative', className)}>
            <Input
                ref={ref}
                type={visible ? 'text' : 'password'}
                className="pr-11"
                {...props}
            />
            <button
                type="button"
                onClick={() => setVisible((previous) => !previous)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text"
            >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
});

export default PasswordField;
