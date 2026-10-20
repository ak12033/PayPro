import React from 'react';
import cn from '../../lib/cn';

/**
 * A soft, still brand glow, for the handful of screens that are allowed to
 * spend visual budget on decoration (see NetworkMesh).
 *
 * It used to follow the cursor. A background that slides around as the mouse
 * moves pulls the eye away from the content on top of it, so it now sits in
 * one place, upper centre, where a hero's heading usually is.
 *
 * Containment is structural: the root is `absolute inset-0 overflow-hidden`,
 * clipped to whatever positioned ancestor it's mounted inside, so the glow is
 * only ever visible inside the box the caller puts it in.
 */
const AmbientGlow = ({ className }) => (
    <div
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
        <div className="absolute left-1/2 top-[30%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-brand opacity-[0.08] blur-[110px]" />
    </div>
);

export default AmbientGlow;
