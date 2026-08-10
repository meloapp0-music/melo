import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Tailwind + the Sleek design tokens first, App.css second, so the app's
// existing rules still win wherever the two overlap. Screens move onto
// utilities one at a time; until then nothing should change appearance.
import './theme.css';
import './App.css';
import { initAnalytics, track } from './lib/analytics';

// Boot product analytics before render. No-ops if VITE_POSTHOG_KEY is
// unset. `app_opened` fires once per cold start — the base event for
// retention cohorts. See docs/initiatives/2026-05-15-product-analytics.md.
initAnalytics();
track('app_opened');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
