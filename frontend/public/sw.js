const CACHE_NAME = 'taskpro-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Nie używamy już Service Workera do cache'owania, zawsze pobieraj z sieci
    event.respondWith(fetch(event.request));
});
