const CACHE_NAME = 'vocalis-shell-v2';

const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }).catch(err => console.error('SW Install Error:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).catch(err => console.error('SW Activate Error:', err))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 2. Retornar sem chamar respondWith para casos inválidos/não-cacheáveis
  if (request.method !== 'GET') return;
  
  const url = new URL(request.url);

  // Ignorar protocolos não HTTP/HTTPS (chrome-extension:, data:, blob:, etc)
  if (!url.protocol.startsWith('http')) return;

  // Ignorar cross-origin
  if (url.origin !== self.location.origin) return;

  // Ignorar o próprio sw.js
  if (url.pathname === '/sw.js') return;

  // Ignorar HMR e recursos internos de dev
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('/_next/webpack')) return;

  // 3. Não armazenar chamadas dinâmicas/API/Supabase/Server Actions e RSC privados
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname.startsWith('/sala/') || 
    url.origin.includes('supabase.co') ||
    request.headers.has('Next-Action') // Server Actions
  ) {
    return;
  }

  // Shell assets -> Cache first, fallback to network
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(request).catch(() => {
          // Tratar erro e retornar Response válida para evitar Uncaught TypeError
          return new Response('Offline resource not found', { 
            status: 503, 
            statusText: 'Service Unavailable' 
          });
        });
      })
    );
    return;
  }

  // Navegação e Outros -> Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Não fazer cache de respostas que não sejam de sucesso (ok) ou privadas
        if (
          !networkResponse || 
          networkResponse.status !== 200 || 
          networkResponse.type !== 'basic' ||
          (networkResponse.headers.get('Cache-Control') || '').includes('private')
        ) {
          return networkResponse;
        }

        const clonedResponse = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clonedResponse);
        }).catch(err => console.error('SW Cache Error:', err));
        
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // Se for uma requisição de navegação (HTML), podemos tentar retornar o fallback
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          
          return new Response('Offline', { 
            status: 503, 
            statusText: 'Service Unavailable' 
          });
        });
      })
  );
});
