import { httpClient } from './httpClient';
import { attachAuthInterceptors } from './interceptors';

/**
 * Wiring point for the HTTP layer.
 *
 * Importing this module is what installs the auth interceptors, so every
 * feature service must go through `api` rather than reaching for axios itself.
 */
export const api = attachAuthInterceptors(httpClient);

export default api;
