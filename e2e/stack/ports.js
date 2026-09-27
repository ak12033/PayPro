/** Fixed ports, away from the dev defaults (5000/5173/27017), so a running dev stack does not collide. */
export const MONGO_PORT = Number(process.env.E2E_MONGO_PORT || 27999);
export const API_PORT = Number(process.env.E2E_API_PORT || 5055);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5174);

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
/** The API appends `/PayPro` itself (server/config/db.js). */
export const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/?replicaSet=e2e`;
export const MONGO_DB = 'PayPro';
