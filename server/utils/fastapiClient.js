import axios from 'axios';
import config from '../config/env.js';

const fastapiClient = axios.create({
    baseURL: config.FASTAPI_URL || 'http://localhost:8000',
    timeout: 12000,
    headers: {
        // Shared secret. The AI service previously had no authentication at
        // all, so anyone who could reach its URL could burn our Gemini quota.
        ...(config.FASTAPI_API_KEY && { 'X-API-Key': config.FASTAPI_API_KEY }),
    },
});

/**
 * Retry once on a transient failure.
 *
 * Gemini returns 429/503 under load often enough that a single blip previously
 * meant a transaction was silently filed under "Others" with a fraud score of 0.
 * Only idempotent read-style calls are retried, and only for transient causes.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const postWithRetry = async (path, body, { retries = 1 } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fastapiClient.post(path, body);
            return response.data;
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const isTransient =
                !error.response ||               // network error / timeout
                RETRYABLE_STATUS.has(status);

            if (!isTransient || attempt === retries) break;

            // Brief linear backoff; the caller is holding an HTTP request open.
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
    }

    throw lastError;
};

/**
 * Every helper below degrades to a safe default rather than failing the user's
 * transaction, but the fallbacks are chosen deliberately:
 *
 *  - categorisation falls back to "Others" (harmless);
 *  - fraud checking falls back to risk 0 / 'low'. That is a *fail-open* control
 *    and is called out explicitly in the log so it can be alerted on. Failing
 *    closed would block legitimate payments during an AI outage, which for a
 *    wallet is the worse trade — but it must be visible when it happens.
 */
export const categorizeTransaction = async (description, amount) => {
    try {
        return await postWithRetry('/ai/categorize', { description, amount });
    } catch (error) {
        console.error('FastAPI categorization failed:', error.message);
        return { category: 'Others', confidence_score: 0.0, icon: 'CircleDollarSign' };
    }
};

export const checkFraud = async (newTransaction, history) => {
    try {
        return await postWithRetry('/ai/fraud-check', {
            new_transaction: newTransaction,
            history: history
        });
    } catch (error) {
        console.error(
            '⚠️  FRAUD CHECK UNAVAILABLE — transaction allowed without screening:',
            error.message
        );
        return { risk_score: 0, risk_level: 'low', reason: 'Fraud check service unavailable.' };
    }
};

export const getInsights = async (transactions) => {
    try {
        const data = await postWithRetry('/ai/insights', { transactions });
        return data.insights ?? [];
    } catch (error) {
        console.error('FastAPI insights failed:', error.message);
        return [];
    }
};

export const getAssistantResponse = async (query, transactions) => {
    try {
        const data = await postWithRetry('/ai/assistant', { query, transactions });
        return data.response;
    } catch (error) {
        console.error('FastAPI assistant failed:', error.message);
        return 'I am currently unable to process your request due to a service connection error.';
    }
};

export default fastapiClient;
