import { initializeApp } from 'firebase/app';
import { env } from '../../app/config/env';

/**
 * Firebase is initialised once, here, and nowhere else.
 *
 * Config values come from `app/config/env` rather than inline `import.meta.env`
 * reads so the fallbacks live with every other environment default.
 */
export const firebaseApp = initializeApp(env.firebase);

export default firebaseApp;
