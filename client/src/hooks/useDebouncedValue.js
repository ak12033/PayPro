import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../constants/app';

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * Used to stop the transaction search box firing one request per keystroke.
 */
export const useDebouncedValue = (value, delay = SEARCH_DEBOUNCE_MS) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);

    return debounced;
};

export default useDebouncedValue;
