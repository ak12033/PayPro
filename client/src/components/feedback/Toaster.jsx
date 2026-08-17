import React from 'react';
import { Toaster as HotToaster } from 'react-hot-toast';

/**
 * Toast configuration, in one place and themed.
 *
 * The previous setup hardcoded a dark slate gradient, so in light mode every
 * toast was a dark slab. Everything here reads from the semantic tokens, which
 * means toasts follow the theme with no branching.
 *
 * Position is bottom-centre on mobile: a top-right toast on a phone lands under
 * the notch or over the status bar, and it is the furthest point from the
 * thumb. On desktop there is no such constraint and top-right is conventional,
 * so the offset simply clears the fixed tab bar.
 */
const Toaster = () => (
    <HotToaster
        position="bottom-center"
        containerStyle={{ bottom: 88 }}
        toastOptions={{
            duration: 4000,
            style: {
                background: 'var(--color-overlay)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--shadow-overlay)',
                fontSize: '0.875rem',
                padding: '0.75rem 1rem',
                maxWidth: '26rem',
            },
            success: {
                iconTheme: {
                    primary: 'var(--color-success)',
                    secondary: 'var(--color-surface)',
                },
            },
            error: {
                // Errors linger: a failure the user misses is a failure they
                // will hit again.
                duration: 6000,
                iconTheme: {
                    primary: 'var(--color-danger)',
                    secondary: 'var(--color-surface)',
                },
            },
        }}
    />
);

export default Toaster;
