const CACHE_NAME = 'ialert-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './admin.html',
    './resident.html',
    './admin-register.html',
    './css/main.css',
    './css/auth.css',
    './css/admin.css',
    './css/resident.css',
    './js/firebase-config.js',
    './js/auth.js',
    './js/admin-auth.js',
    './js/admin.js',
    './js/resident.js',
    './js/pwa-install.js',
    './sound/emergency-alert.mp3',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate Service Worker
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
        })
    );
});

// Fetch Strategy: Stale-While-Revalidate
// 1. Serve from cache instantly
// 2. Fetch from network in background
// 3. Update cache with fresh version
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests (e.g. Firestore, Auth)
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests except for Google Fonts and Leaflet
    const url = new URL(event.request.url);
    const isInternal = url.origin === location.origin;
    const isExternalAsset = url.hostname.includes('fonts.googleapis.com') || 
                           url.hostname.includes('fonts.gstatic.com') ||
                           url.hostname.includes('unpkg.com');

    if (!isInternal && !isExternalAsset) return;

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    // Update cache for GET requests only
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fail silently, we'll use cachedResponse if it exists
                });

                // Return cached response instantly if available, otherwise wait for network
                return cachedResponse || fetchedResponse;
            });
        })
    );
});
