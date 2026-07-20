import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NeedleApp from './components/NeedleApp.tsx';
import './index.css';

// Lightweight path switch (no routing library): the isolated NEEDLE web app is
// served under /needle/app; every other path renders the Mathom House site.
const path = window.location.pathname;
const isNeedleApp = path === '/needle/app' || path === '/needle/app/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isNeedleApp ? <NeedleApp /> : <App />}
  </StrictMode>,
);
