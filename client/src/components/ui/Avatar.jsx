import React from 'react';
import cn from '../../lib/cn';

const SIZES = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-xl',
};

/**
 * Deterministic tint from the name.
 *
 * Every recipient getting the same grey circle made the P2P picker a list of
 * identical rows that had to be read word by word. A stable per-person colour
 * gives the list a shape you can navigate by recognition — and because it is
 * derived from the name rather than randomised, the same person is the same
 * colour on every screen and every session.
 *
 * Colour is never the only signal: the initials are always rendered.
 */
const TINTS = [
    'bg-accent-soft text-accent-text',
    'bg-positive-soft text-positive',
    'bg-warning-soft text-warning',
    'bg-ai-soft text-ai',
    'bg-info-soft text-info',
];

const hashName = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) % 1000;
    }
    return hash;
};

export const getInitials = (name = '') => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const Avatar = ({ name = '', size = 'md', icon, className }) => {
    const tint = TINTS[hashName(name || '?') % TINTS.length];

    return (
        <span
            // Decorative: the name is always rendered next to it in the row, so
            // announcing the initials again would just be a duplicate.
            aria-hidden="true"
            className={cn(
                'inline-grid shrink-0 place-items-center rounded-full font-semibold',
                SIZES[size],
                icon ? 'bg-surface-sunken text-text-secondary' : tint,
                className
            )}
        >
            {icon ?? getInitials(name)}
        </span>
    );
};

export default Avatar;
