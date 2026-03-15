// Firebase Configuration
// IMPORTANT: Replace these with your actual Firebase project credentials
// Get these from: Firebase Console > Project Settings > General > Your apps

const firebaseConfig = {
    apiKey: "AIzaSyBiuAzJKByWtxNIMARwPADDqoMv0hWajig",
    authDomain: "i-alert-pantukan.firebaseapp.com",
    projectId: "i-alert-pantukan",
    storageBucket: "i-alert-pantukan.firebasestorage.app",
    messagingSenderId: "189485516577",
    appId: "1:189485516577:web:81ee9cb29e31d58a812060"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Cloud Messaging (FCM)
let messaging = null;
try {
    if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
    }
} catch (e) {
    console.log("Messaging not supported in this browser:", e);
}

// Helper: Request notification permission and get token
async function requestNotificationPermission(userId, collection = 'USERS') {
    if (!messaging) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Ensure service worker is registered and active
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
                // Wait for it to be active
                await navigator.serviceWorker.ready;
                
                const token = await messaging.getToken({
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration
                });

                if (token) {
                    console.log('FCM Token:', token);
                    // Save token to firestore for this user
                    await db.collection(collection).doc(userId).update({
                        fcmToken: token,
                        notificationsEnabled: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    return token;
                }
            }
        }
    } catch (error) {
        console.error('Error requesting notification permission:', error);
    }
}

// Helper: Show native browser notification
function showNativeNotification(title, body, icon = 'assets/icons/icon-192x192.png') {
    if (Notification.permission === 'granted') {
        const options = {
            body: body,
            icon: icon,
            vibrate: [200, 100, 200],
            badge: 'assets/icons/icon-192x192.png'
        };
        new Notification(title, options);
    }
}

// Helper: Show toast notification
function showToast(message, type = 'info', duration = 3500) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    // Clear any existing timeouts if possible (skip for simplicity)
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Helper: Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Just now';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper: Format full date
function formatFullDate(timestamp) {
    if (!timestamp) return 'N/A';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Emergency type labels and icons
const EMERGENCY_TYPES = {
    fire: { label: 'Fire Emergency', icon: '🔥', color: '#EF4444' },
    police: { label: 'Police Assistance', icon: '👮', color: '#3B82F6' },
    medical: { label: 'Medical Emergency', icon: '🏥', color: '#10B981' },
    rescue: { label: 'Search & Rescue', icon: '⛑️', color: '#F59E0B' },
    traffic: { label: 'Road Accident', icon: '🚦', color: '#EC4899' },
    other: { label: 'Other Emergency', icon: '⚠️', color: '#64748B' }
};

// Status labels
const STATUS_LABELS = {
    pending: 'Pending',
    responding: 'Responding',
    resolved: 'Resolved'
};

// Department authorization codes (in production, these should be server-side)
const DEPARTMENT_CODES = {
    mdrrmc: 'MDRRMC2026',
    bfp: 'BFP2026',
    pnp: 'PNP2026'
};

console.log('Firebase initialized successfully');

// ==========================================
// VERSION MANAGER (Auto Cache Buster)
// ==========================================
(async function checkAppVersion() {
    // Only check when online to prevent offline breakage
    if (!navigator.onLine) return;

    try {
        // Fetch version.json bypassing cache
        const response = await fetch('./version.json?t=' + new Date().getTime(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) return;

        const data = await response.json();
        const currentVersion = localStorage.getItem('appVersion');

        // If version is missing or outdated, update and force hard refresh
        if (!currentVersion || currentVersion !== data.version) {
            console.log(`[Version Manager] New update detected: v${data.version}. Clearing cache...`);

            // Store new version instantly
            localStorage.setItem('appVersion', data.version);

            // Clear all Service Worker caches to enforce new assets
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            // Unregister old Service Workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let reg of registrations) {
                    await reg.unregister();
                }
            }

            // Reload the page hard, bypassing browser cache
            window.location.reload(true);
        }
    } catch (error) {
        console.error('[Version Manager] Failed to check version:', error);
    }
})();

// ── System Config Settings ───────────────────
const VAPID_KEY = 'BO3hwJyyIf6uCzCNHCK1r_zUwr4ksLMhhMc2BSATaot5xxv8o11zsXaWrl_S6hsWIsFkZJ5VreESYNB4I-ZmM90';

// Store system config in Firestore for record keeping (as requested)
async function syncSystemConfig() {
    try {
        await db.collection('SYSTEM_CONFIG').doc('messaging').set({
            vapidKey: VAPID_KEY,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('System config synced to Firestore');
    } catch (e) {
        console.warn('Failed to sync system config:', e);
    }
}
// Run once on load
syncSystemConfig();

// ── iOS Zoom Fix (Global) ───────────────────
// This prevents pinch-to-zoom and double-tap zoom for a more native application feel.
(function fixedViewportiOS() {
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300 && e.cancelable) e.preventDefault();
        lastTouchEnd = now;
    }, false);
})();
