import axios from 'axios';
import config from '../config/env.js';
import { CATEGORY_NAMES } from '../constants/categories.js';
import { resolveAiCategory } from '../services/categoryService.js';
import logger from './logger.js';

/**
 * The AI service's two server-to-server endpoints.
 *
 * The browser calls the AI service directly for the assistant and insights;
 * these two are different. Categorisation and fraud scoring run *inside* the
 * ledger's write path — a transaction cannot be created without them — so they
 * stay a backend-to-backend dependency, authenticated with the shared secret
 * rather than a user's token.
 */
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
        // The canonical list travels with every call so the AI service's
        // prompt and this codebase's category registry can never drift apart
        // — previously the two were maintained as two separately-edited lists
        // (19 categories in the FastAPI prompt vs 12 here).
        const result = await postWithRetry('/ai/categorize', {
            description,
            amount,
            allowed_categories: CATEGORY_NAMES,
        });

        // Defence in depth: even if the model (or an older, un-redeployed AI
        // service) returns something off-list, this never lets an unknown
        // category value reach the ledger.
        const { category, icon } = resolveAiCategory(result.category);
        return { ...result, category, icon };
    } catch (error) {
        logger.error('FastAPI categorization failed', { error: error.message });
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
        logger.error('Fraud check unavailable; transaction allowed without screening', { error: error.message });
        return { risk_score: 0, risk_level: 'low', reason: 'Fraud check service unavailable.' };
    }
};

export default fastapiClient;
