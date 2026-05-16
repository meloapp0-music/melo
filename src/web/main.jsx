import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
