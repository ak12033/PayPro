import aiClient from '../aiClient';

/**
 * Every call here goes straight to the AI service, not to the Node backend.
 * The paths are unchanged from when Node proxied them, so the response shapes
 * these screens consume are the same.
 */
export const aiApi = {
    getHistory: () => aiClient.get('/ai/history'),

    /** `path` gives the assistant page-awareness for the current screen. */
    sendMessage: ({ query, path }) => aiClient.post('/ai/chat', { query, path }),

    clearHistory: () => aiClient.delete('/ai/history'),

    /**
     * AI insights over the user's last 50 transactions.
     *
     * Rate limited by the AI service because every call costs money on our
     * Gemini key, which is why nothing in the UI fetches this on mount without
     * the user having asked to see it.
     */
    getInsights: () => aiClient.get('/ai/insights'),
};

export default aiApi;
