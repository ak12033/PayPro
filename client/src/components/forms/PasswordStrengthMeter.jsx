import React from 'react';
import cn from '../../lib/cn';
import { getPasswordStrength } from '../../utils/password';

/**
 * Password strength.
 *
 * Four discrete segments rather than one continuous bar, because the underlying
 * score *is* discrete — it counts four satisfied requirements — and a smooth
 * bar implies a precision the scoring does not have.
 *
 * The unmet requirements are listed. A meter that says "Fair" and stops has
 * told the user they failed without telling them how to pass, which is the
 * single most common failure of this component across the industry.
 *
 * `aria-live="polite"` announces the level as it changes, so the feedback is
 * not purely visual.
 */
const PasswordStrengthMeter = ({ password = '' }) => {
    const strength = getPasswordStrength(password);

    if (!password) return null;

    return (
        <div className="pt-0.5">
            <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                    <span
                        key={index}
                        className={cn(
                            'h-1 flex-1 rounded-pill transition-colors duration-[--duration-fast]',
                            index < strength.score ? strength.tone : 'bg-border'
                        )}
                    />
                ))}
            </div>

            <p aria-live="polite" className="mt-1.5 text-xs text-text-muted">
                <span className="font-medium text-text-secondary">{strength.label}</span>
                {strength.unmet.length > 0 && (
                    <> — add {strength.unmet.map((r) => r.label.toLowerCase()).join(', ')}</>
                )}
            </p>
        </div>
    );
};

export default PasswordStrengthMeter;
