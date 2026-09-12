import axios from 'axios';
import { AI_BASE_URL } from '../../app/config/env';
import { REQUEST_TIMEOUT_MS } from '../../constants/app';
import { attachAuthInterceptors } from './interceptors';

/**
 * Transport for the AI service.
 *
 * AI requests no longer travel through the Node backend — the browser calls the
 * AI service directly, and that service verifies the same access token. So this
 * is a second axios instance rather than a second base path: different origin,
 * same bearer credential, same silent-refresh behaviour (the refresh itself
 * still happens against Node, which owns the session cookie).
 *
 * `withCredentials` is off, deliberately. The AI service never reads a cookie,
 * so sending the refresh cookie cross-origin would widen its exposure for no
 * benefit — and it lets that service keep `allow_credentials=False` in CORS.
 */
export const aiClient = attachAuthInterceptors(
    axios.create({
        baseURL: AI_BASE_URL,
        withCredentials: false,
        timeout: REQUEST_TIMEOUT_MS,
    })
);

export default aiClient;
