import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

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
