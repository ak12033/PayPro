/**
 * Loads a third-party <script> once and resolves when it is ready.
 *
 * Kept in `lib/` because it is a browser/DOM adapter rather than a pure helper:
 * it mutates the document. Repeat calls for an already-present script resolve
 * immediately instead of injecting a duplicate tag.
 */
const loaded = new Map();

export const loadExternalScript = (src) => {
    if (loaded.has(src)) return loaded.get(src);

    const promise = new Promise((resolve) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve(true);
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => {
            // Allow a later retry rather than caching the failure forever.
            loaded.delete(src);
            resolve(false);
        };
        document.body.appendChild(script);
    });

    loaded.set(src, promise);
    return promise;
};
