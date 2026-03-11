// iAlert Pantukan - Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBiuAzJKByWtxNIMARwPADDqoMv0hWajig",
    authDomain: "i-alert-pantukan.firebaseapp.com",
    projectId: "i-alert-pantukan",
    storageBucket: "i-alert-pantukan.firebasestorage.app",
    messagingSenderId: "189485516577",
    appId: "1:189485516577:web:81ee9cb29e31d58a812060"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'iAlert Notification';
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'assets/icons/icon-192x192.png',
    badge: 'assets/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Default URL to open
    let url = './index.html';
    
    // If we have specific data, we could redirect to a specific report
    // but for now just open the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If tab is already open, focus it
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new tab
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
