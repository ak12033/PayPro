import { useCallback, useState } from 'react';

/**
 * Open/close state for menus, panels and dropdowns.
 *
 * The callbacks are stable, so a child receiving `close` as a prop does not
 * re-render every time the parent does.
 */
export const useDisclosure = (initial = false) => {
    const [isOpen, setIsOpen] = useState(initial);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

    return { isOpen, open, close, toggle };
};

export default useDisclosure;
