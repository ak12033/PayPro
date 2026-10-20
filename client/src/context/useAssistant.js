import { createContext, useContext } from 'react';

export const AssistantContext = createContext(null);

const UNAVAILABLE = { openAssistant: () => {}, available: false, isOpen: false };

/**
 * `openAssistant({ prompt?, resource? })` from anywhere inside the app shell.
 *
 * Outside the shell (a focused full-screen flow, a test rendering one page)
 * there is no assistant; `available` is false and entry points hide
 * themselves rather than render a button that does nothing.
 */
export const useAssistant = () => useContext(AssistantContext) ?? UNAVAILABLE;

export default useAssistant;
