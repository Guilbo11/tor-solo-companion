import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';


// Apply saved theme as early as possible (before React render)
try {
  const t = localStorage.getItem('tor-theme');
  if (t === 'corebook' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('theme-corebook', t === 'corebook');
  }
} catch {}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA Service Worker (install + fullscreen)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore */
    });
  });
}