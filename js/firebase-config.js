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

// Helper: Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
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
    fire: 'FIRE2026',
    police: 'POLICE2026',
    medical: 'MEDICAL2026',
    rescue: 'RESCUE2026',
    traffic: 'TRAFFIC2026'
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
