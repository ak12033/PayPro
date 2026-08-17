import axios from 'axios';
import { API_BASE_URL } from '../../app/config/env';
import { REQUEST_TIMEOUT_MS } from '../../constants/app';

/**
 * The single configured axios instance.
 *
 * Interceptors are attached separately (see `interceptors.js`) so this module
 * stays free of auth logic and can be imported by anything that just needs a
 * pre-configured transport.
 */
export const httpClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    // No timeout previously: a hung backend left the spinner turning forever
    // with no error path and no way for the user to recover.
    timeout: REQUEST_TIMEOUT_MS,
});

export default httpClient;
