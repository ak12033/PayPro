import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initErrorTracking } from './services/errorTracking'

// Not awaited: a no-op without VITE_SENTRY_DSN, and never worth delaying the
// first paint for when set.
initErrorTracking()

createRoot(document.getElementById('root')).render(
    <App />,
)
