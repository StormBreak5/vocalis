'use client';

import { useEffect } from 'react';

const CACHE_PREFIX = 'vocalis-';

export function ServiceWorkerManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);

      if ('caches' in window) {
        void caches.keys()
          .then((cacheNames) =>
            Promise.all(
              cacheNames
                .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
                .map((cacheName) => caches.delete(cacheName)),
            ),
          )
          .catch(() => undefined);
      }

      return;
    }

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('Falha ao registrar o Service Worker:', error);
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
