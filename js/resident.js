// Resident Dashboard Logic

let currentUser = null;
let currentLocation = null;
let map = null;
let marker = null;
let locationCircle = null;
window.selectedEmergencyType = null;
let currentPage = 1;
const itemsPerPage = 5;

// Fallback and Config placeholders
let CLOUDINARY_CONFIG = {
    cloudName: 'djghkklph',
    apiKey: '613592386419746',
    apiSecret: 'CREDENTIAL_STORED_IN_FIRESTORE'
};

async function syncCloudinaryConfig() {
    try {
        const doc = await db.collection('config').doc('cloudinary').get();
        if (doc.exists) {
            CLOUDINARY_CONFIG = doc.data();
            console.log("[Resident] Cloudinary config synced from Firestore");
        }
    } catch (e) {
        console.warn("[Resident] Cloudinary sync failed:", e);
    }
}
syncCloudinaryConfig();

// Check authentication
async function checkAuth() {
    const userJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (!userJson) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(userJson);

    try {
        if (!user.id) {
            throw new Error('Invalid user session');
        }

        // Fetch fresh data from USERS collection
        const userDoc = await db.collection('USERS').doc(user.id).get();

        if (userDoc.exists) {
            const userData = userDoc.data();

            // Redirect admin users
            if (userData.role === 'admin') {
                window.location.href = 'admin.html';
                return;
            }

            // Set currentUser with uid property for compatibility
            currentUser = { uid: userDoc.id, ...userData };

            // Update UI
            document.getElementById('userName').textContent = `Welcome, ${userData.name}`;

            // Setup Dynamic Greeting
            const firstName = userData.name.split(' ')[0];
            const greetings = [
                `Hi, ${firstName}! We're here to keep you safe.`,
                `Welcome back, ${firstName}. Stay safe today.`,
                `Hello, ${firstName}! We're always here for you.`,
                `Stay safe, ${firstName}. Help is one tap away.`,
                `Welcome back, ${firstName}! Stay safe out there.`,
                `Good day, ${firstName}! Your safety matters.`
            ];

            // Pick a random greeting and assign it
            const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            const greetingEl = document.getElementById('dynamicGreeting');
            if (greetingEl) {
                greetingEl.textContent = randomGreeting;
            }

            // Load user's reports
            loadMyReports();

            // Auto-request GPS Location when logged in / dashboard loaded
            requestBackgroundLocation();
        } else {
            // User deleted or invalid
            localStorage.removeItem('currentUser');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user data', 'error');
        // Optional: clear session
    }
}

// Initialize
checkAuth();

// Logout Handler
// User Menu Toggle
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');

userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('active');
    }
});

// Profile Management
const profileLink = document.querySelector('a[href="#"][class="dropdown-item"]:first-child');
const profileModal = document.getElementById('profileModal');
const profileForm = document.getElementById('profileForm');
const closeProfileModalBtn = document.getElementById('closeProfileModal');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');

// Open Profile Modal
profileLink.addEventListener('click', (e) => {
    e.preventDefault();
    userDropdown.classList.remove('active');

    // Fill current data
    if (currentUser) {
        document.getElementById('profileName').value = currentUser.name || '';
        document.getElementById('profilePhone').value = currentUser.phone || '';
        document.getElementById('profileAddress').value = currentUser.address || '';
        document.getElementById('profilePassword').value = ''; // Clear password field
    }

    profileModal.classList.add('active');
});

// Close Profile Modal
function closeProfileModal() {
    profileModal.classList.remove('active');
    profileForm.reset();
}

closeProfileModalBtn.addEventListener('click', closeProfileModal);
cancelProfileBtn.addEventListener('click', closeProfileModal);

// Handle Profile Update
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = document.getElementById('saveProfileBtn');
    const originalBtnContent = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner"></div> Saving...';

    const updates = {
        name: document.getElementById('profileName').value,
        phone: document.getElementById('profilePhone').value,
        address: document.getElementById('profileAddress').value
    };

    const newPassword = document.getElementById('profilePassword').value;
    if (newPassword) {
        updates.password = newPassword;
    }

    try {
        // Update Firestore
        await db.collection('USERS').doc(currentUser.uid).update(updates);

        // Update Local State and Storage
        const updatedUser = { ...currentUser, ...updates };
        delete updatedUser.password; // Don't store password in local state
        currentUser = updatedUser;
        localStorage.setItem('currentUser', JSON.stringify(updatedUser)); // Only stores safe data usually, but syncing just in case

        // Update UI
        document.getElementById('userName').textContent = `Welcome, ${currentUser.name}`;

        showToast('Profile updated successfully', 'success');
        closeProfileModal();

    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Failed to update profile', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnContent;
    }
});

// Settings Management
const settingsLink = document.querySelector('a[href="#"][class="dropdown-item"]:nth-child(2)'); // "Settings" link
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

// Open Settings
settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    userDropdown.classList.remove('active');
    settingsModal.classList.add('active');
});

// Close Settings
function closeSettings() {
    settingsModal.classList.remove('active');
}

closeSettingsModalBtn.addEventListener('click', closeSettings);
closeSettingsBtn.addEventListener('click', closeSettings);

// Dark Mode Logic
function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';

    // Apply theme
    applyTheme(isDark);

    // Set toggle state
    if (darkModeToggle) {
        darkModeToggle.checked = isDark;
    }
}

function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        // Optional: Update meta theme color
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0f172a');
    } else {
        document.body.classList.remove('dark-mode');
        // Optional: Update meta theme color
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#dc2626');
    }
}

// Toggle Handler
if (darkModeToggle) {
    darkModeToggle.addEventListener('change', (e) => {
        const isDark = e.target.checked;
        applyTheme(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// Initialize Theme on Load
document.addEventListener('DOMContentLoaded', initTheme);

// Logout Handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    try {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
});

// Emergency Card Click Handler
document.querySelectorAll('.emergency-card').forEach(card => {
    card.addEventListener('click', () => {
        window.selectedEmergencyType = card.dataset.type;
        openEmergencyModal();
    });
});
// Open Emergency Modal
function openEmergencyModal() {
    const modal = document.getElementById('emergencyModal');
    const modalIcon = document.getElementById('modalEmergencyIcon');
    const modalType = document.getElementById('modalEmergencyType');

    const emergency = EMERGENCY_TYPES[window.selectedEmergencyType];
    modalIcon.textContent = emergency.icon;
    modalType.textContent = emergency.label;

    // Set modal type for category-specific "effects"
    modal.dataset.type = window.selectedEmergencyType;

    // Reset form
    document.getElementById('emergencyForm').reset();
    document.getElementById('locationText').textContent = 'Click the button above to get your current location';
    currentLocation = null;

    // Initialize map and trigger GPS automatically
    setTimeout(() => {
        initMap();
        triggerGPS(); // Auto-trigger GPS when modal opens
    }, 100);

    modal.classList.add('active');
}

// Expose to window for chatbot access
window.openEmergencyModal = openEmergencyModal;
window.closeModal = closeModal;

// Close Modal
document.getElementById('closeModal')?.addEventListener('click', closeModal);
document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
function closeReportDetailsModal() {
    document.getElementById('reportDetailsModal').classList.remove('active');
    // Clean up live responder resources
    if (_responderUnsubscribe) { _responderUnsubscribe(); _responderUnsubscribe = null; }
    if (_responderMap) { _responderMap.remove(); _responderMap = null; }
}
document.getElementById('closeDetailsModal')?.addEventListener('click', closeReportDetailsModal);
document.getElementById('closeDetailsBtn')?.addEventListener('click', closeReportDetailsModal);

function closeModal() {
    const modal = document.getElementById('emergencyModal');
    modal.classList.remove('active');
    modal.dataset.type = ''; // Reset type
    if (map) {
        map.remove();
        map = null;
        marker = null;
        locationCircle = null;
    }
}

let isManualPinMode = false;

// Initialize Map
function initMap() {
    const mapElement = document.getElementById('map');

    // Default to Pantukan coordinates
    const defaultLat = 7.1472;
    const defaultLng = 126.0633;

    if (map) {
        map.remove();
    }

    map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView([defaultLat, defaultLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add marker if location is already set
    if (currentLocation) {
        if (marker) map.removeLayer(marker);
        if (locationCircle) map.removeLayer(locationCircle);
        marker = L.marker([currentLocation.lat, currentLocation.lng]).addTo(map);
        map.setView([currentLocation.lat, currentLocation.lng], 16);
    }

    // Add manual pinning support (Only works if mode is enabled)
    map.on('click', (e) => {
        if (!isManualPinMode) return;

        const { lat, lng } = e.latlng;
        setIncidentLocation(lat, lng, 10, true);
        showToast('Location pinned manually', 'success');
    });
}

// Request location transparently in the background
function requestBackgroundLocation(isUserTriggered = false) {
    if (!navigator.geolocation) {
        if (isUserTriggered) showToast('GPS not supported on this browser', 'error');
        return;
    }

    const banner = document.getElementById('locationAlert');
    const btn = document.getElementById('enableGPSBtn');

    if (isUserTriggered && btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;margin-right:5px;"></div> Trying...';
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            console.log('Background GPS location acquired successfully.');
            if (banner) banner.classList.remove('active');

            if (isUserTriggered) {
                showToast('GPS Location enabled!', 'success');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Enable GPS';
                }
            }
        },
        (error) => {
            console.warn('Background GPS location failed or denied:', error);
            // On failure or denial, show the banner
            if (banner) banner.classList.add('active');

            if (isUserTriggered) {
                let msg = 'Unable to get location';
                if (error.code === 1) msg = 'Location access denied. Please enable it in your phone settings.';
                else if (error.code === 3) msg = 'Location request timed out. Try again in a more open area.';

                showToast(msg, 'error');

                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Enable GPS';
                }

                // Check for in-app browsers (Messenger/Facebook) which often block GPS
                const ua = navigator.userAgent || navigator.vendor || window.opera;
                if ((ua.indexOf('FBAN') > -1) || (ua.indexOf('FBAV') > -1) || (ua.indexOf('Messenger') > -1)) {
                    setTimeout(() => {
                        showToast('Tip: If GPS still fails, tap the three dots (⋮) and chose "Open in Chrome/System Browser"', 'info');
                    }, 3000);
                }
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Global listener for "Enable GPS" button
document.getElementById('enableGPSBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    requestBackgroundLocation(true);
});

// Trigger GPS Acquisition Logic
function triggerGPS() {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }

    const btn = document.getElementById('btnLiveLocation');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> <span>Getting GPS...</span>';
    }

    const banner = document.getElementById('locationAlert');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setIncidentLocation(latitude, longitude, accuracy, false);

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg> <span>Get Live GPS</span>';
            }

            if (banner) banner.classList.remove('active');
            showToast('Live location acquired', 'success');
        },
        (error) => {
            console.error('Geolocation error:', error);
            let errorMessage = 'Unable to get your location';

            if (error.code === 1) errorMessage = 'Location permission denied';
            else if (error.code === 2) errorMessage = 'Location unavailable';
            else if (error.code === 3) {
                errorMessage = 'Location request timed out. Please try Manual Pin mode.';
            }

            showToast(errorMessage, 'error', 6000);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg> <span>Get Live GPS</span>';
            }
            if (banner) banner.classList.add('active');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ── Incident Location Logic ───────────────────

// Set and Update Incident Location
async function setIncidentLocation(lat, lng, accuracy, isManual = false) {
    currentLocation = { lat, lng, accuracy };

    // Update map UI
    if (map) {
        if (marker) map.removeLayer(marker);
        if (locationCircle) map.removeLayer(locationCircle);

        marker = L.marker([lat, lng]).addTo(map);
        map.setView([lat, lng], 16);

        if (!isManual) {
            locationCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#DC2626',
                fillColor: '#DC2626',
                fillOpacity: 0.1
            }).addTo(map);
        }
    }

    const locText = document.getElementById('locationText');
    if (locText) {
        locText.textContent = isManual
            ? `Manually pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`
            : `Live location acquired (±${Math.round(accuracy)}m accuracy)`;
    }

    // Trigger Nearby Place (Establishment) Finder
    findNearbyEstablishments(lat, lng);
}

// Location Mode Handlers
document.getElementById('btnLiveLocation')?.addEventListener('click', () => {
    isManualPinMode = false;
    document.getElementById('btnLiveLocation').classList.add('active');
    document.getElementById('btnManualPin').classList.remove('active');
    document.getElementById('map').classList.remove('manual-pin-active');
    triggerGPS();
});

document.getElementById('btnManualPin')?.addEventListener('click', () => {
    isManualPinMode = true;
    document.getElementById('btnManualPin').classList.add('active');
    document.getElementById('btnLiveLocation').classList.remove('active');
    document.getElementById('map').classList.add('manual-pin-active');
    showToast('Mode: Tap on map to set pin', 'info');
});

// ── Establishment Suggestion Engine ─────────────────

let activeEstablishmentController = null;
const nearbyCache = new Map(); // Simple session cache for speed

async function findNearbyEstablishments(lat, lng) {
    const listEl = document.getElementById('establishmentList');
    const container = document.getElementById('nearbySuggestions');
    const locationNameEl = document.getElementById('detectedLocationName');
    const addressEl = document.getElementById('detectedAddress');

    // 1. Proximity Caching: Check if we already have data for this ~10m area
    const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
    if (nearbyCache.has(cacheKey)) {
        const cached = nearbyCache.get(cacheKey);
        renderLandmarks(cached.elements, lat, lng, cached.revData);
        return;
    }

    // 2. Cancel previous pending request
    if (activeEstablishmentController) {
        activeEstablishmentController.abort();
    }
    activeEstablishmentController = new AbortController();
    const { signal } = activeEstablishmentController;

    // 3. Show loading state
    container.classList.add('active');
    if (locationNameEl) locationNameEl.textContent = "Locating nearby landmarks...";
    if (listEl) listEl.innerHTML = `<div class="loading-shimmer-card"></div><div class="loading-shimmer-card"></div>`;

    try {
        // Run both Geocode and Landmark fetch in parallel for max speed
        const geocodePromise = fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { signal })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);

        const landmarkPromise = (async () => {
            const radius = 250;
            const query = `[out:json][timeout:15];(node["amenity"](around:${radius},${lat},${lng});node["shop"](around:${radius},${lat},${lng});way["building"](around:${radius},${lat},${lng}););out center 8;`;

            const mirrors = [
                'https://overpass.kumi.systems/api/interpreter',
                'https://lz4.overpass-api.de/api/interpreter',
                'https://z.overpass-api.de/api/interpreter',
                'https://overpass-api.de/api/interpreter'
            ].sort(() => Math.random() - 0.5); // Randomize to bypass throttled mirrors

            for (const mirror of mirrors) {
                if (signal.aborted) return null;
                try {
                    const res = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
                        signal: AbortSignal.timeout(6000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.elements?.length) return data.elements;
                    }
                } catch (e) { continue; }
            }
            return [];
        })();

        const [revData, elements] = await Promise.all([geocodePromise, landmarkPromise]);

        if (signal.aborted) return;

        // Update Header UI immediately
        if (revData) {
            const addr = revData.address;
            const placeName = revData.name || addr.suburb || addr.village || addr.neighbourhood || "Incident Site";
            if (locationNameEl) locationNameEl.textContent = `Pinned: ${placeName}`;
            if (addressEl) addressEl.textContent = revData.display_name;
        }

        // 4. Cache and Render
        nearbyCache.set(cacheKey, { elements, revData });
        renderLandmarks(elements, lat, lng, revData);

    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn("Nearby search failed:", e);
        renderLandmarks([], lat, lng, null, true);
    }
}

function renderLandmarks(elements, lat, lng, revData, isError = false) {
    const listEl = document.getElementById('establishmentList');
    const locationNameEl = document.getElementById('detectedLocationName');
    const addressEl = document.getElementById('detectedAddress');

    // Always show current point as top option
    const fallbackUI = `
        <div class="suggestion-card" onclick="setIncidentLocation(${lat}, ${lng}, 5, true)">
            <i>🎯</i>
            <div class="details">
                <span class="name">Current Pinned Point</span>
                <span class="type">High Precision Selection</span>
            </div>
        </div>
    `;

    if (elements && elements.length > 0) {
        listEl.innerHTML = elements.map(el => {
            const tags = el.tags || {};
            let name = tags.name || tags.operator || tags.brand || tags["addr:housename"];
            let type = tags.amenity || tags.shop || tags.building || "Establishment";

            if (!name) {
                if (tags.amenity) name = tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1).replace(/_/g, ' ');
                else if (tags.shop) name = tags.shop.charAt(0).toUpperCase() + tags.shop.slice(1).replace(/_/g, ' ');
                else if (tags["addr:street"]) name = (tags["addr:housenumber"] ? tags["addr:housenumber"] + " " : "") + tags["addr:street"];
                else if (tags.building && tags.building !== 'yes') name = tags.building.charAt(0).toUpperCase() + tags.building.slice(1).replace(/_/g, ' ') + " Building";
                else name = "Nearby Building";
            }

            const eLat = el.lat || (el.center ? el.center.lat : lat);
            const eLng = el.lon || (el.center ? el.center.lon : lng);

            let icon = '🏢';
            if (tags.shop) icon = '🛒';
            else if (['restaurant', 'cafe', 'fast_food'].includes(tags.amenity)) icon = '🍴';
            else if (['hospital', 'clinic', 'pharmacy'].includes(tags.amenity)) icon = '🏥';

            return `
                <div class="suggestion-card" onclick="redirectToEstablishment('${name.replace(/'/g, "\\'")}', ${eLat}, ${eLng})">
                    <i>${icon}</i>
                    <div class="details">
                        <span class="name">${name}</span>
                        <span class="type">${type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')}</span>
                    </div>
                </div>
            `;
        }).join('') + fallbackUI;
    } else {
        listEl.innerHTML = fallbackUI + (isError ? `
            <div style="font-size:0.65rem; color:var(--color-text-muted); padding:10px; font-style:italic; display: flex; flex-direction: column; gap: 8px;">
                <span>Server busy. Real-time landmarks temporarily unavailable.</span>
                <button type="button" onclick="findNearbyEstablishments(${lat}, ${lng})" style="background: none; border: 1px solid var(--border-color); padding: 5px 10px; border-radius: 8px; font-size: 0.65rem; color: var(--color-primary); cursor: pointer; width: fit-content;">
                    Try Refreshing Landmarks
                </button>
            </div>
        ` : '');
    }
}

window.redirectToEstablishment = function (name, lat, lng) {
    setIncidentLocation(lat, lng, 5, true);
    showToast(`Redirected to ${name} `, 'success');
};

// Image & Camera Logic
const imagePreview = document.getElementById('imagePreview');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const removeImageBtn = document.getElementById('removeImageBtn');
const openCameraBtn = document.getElementById('openCameraBtn');
const cameraInterface = document.getElementById('cameraInterface');
const cameraFeed = document.getElementById('cameraFeed');
const captureBtn = document.getElementById('captureBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');

let selectedImageFile = null;
let stream = null;
let currentFacingMode = 'environment'; // Default to back camera

// Set Image Helper
function setImage(file) {
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreviewContainer.style.display = 'block';
        cameraInterface.style.display = 'none';
        stopCamera();
    };
    reader.readAsDataURL(file);
}

// Remove Image
removeImageBtn.addEventListener('click', () => {
    selectedImageFile = null;
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
});

// Start Camera
async function startCamera(facingMode = 'environment') {
    try {
        if (stream) {
            stopCamera();
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: facingMode,
                aspectRatio: { ideal: 0.75 } // Prefer portrait 3:4 for vertical mobile use
            },
            audio: false
        });

        cameraFeed.srcObject = stream;
        cameraInterface.style.display = 'block';
        imagePreviewContainer.style.display = 'none';

    } catch (error) {
        console.error('Camera error:', error);
        showToast('Unable to access camera', 'error');
    }
}

// Stop Camera
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    cameraInterface.style.display = 'none';
}

// Open Camera Button
openCameraBtn.addEventListener('click', () => {
    startCamera(currentFacingMode);
});

// Close Camera Button
closeCameraBtn.addEventListener('click', stopCamera);

// Switch Camera
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(currentFacingMode);
});

// Capture Image
captureBtn.addEventListener('click', () => {
    if (!stream) return;

    const canvas = document.getElementById('cameraCanvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video stream
    canvas.width = cameraFeed.videoWidth;
    canvas.height = cameraFeed.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

    // Convert to file
    canvas.toBlob((blob) => {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setImage(file);
        stopCamera();
    }, 'image/jpeg', 0.8);
});

// Helper to generate SHA1 hash for Cloudinary signature
async function generateSHA1(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Compress Image before upload
async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate scales
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                }, 'image/jpeg', quality);
            };
        };
    });
}

// Upload Image to Cloudinary
async function uploadImageToCloudinary(file) {
    const { cloudName, apiKey, apiSecret } = CLOUDINARY_CONFIG;
    const timestamp = Math.round((new Date()).getTime() / 1000);

    // Generate signature
    // Parameters to sign: timestamp (sorted alphabetically)
    const paramsToSign = `timestamp = ${timestamp}${apiSecret} `;
    const signature = await generateSHA1(paramsToSign);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        return data.secure_url; // Return the image URL
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

// Submit Emergency Report
document.getElementById('emergencyForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = document.getElementById('description').value;

    if (!selectedImageFile) {
        showToast('Please provide an image as proof of the emergency', 'warning');
        return;
    }

    if (!currentLocation) {
        showToast('Please provide your location first', 'warning');
        return;
    }

    const submitBtn = document.getElementById('submitEmergency');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> <span>Sending alert...</span>';

    try {
        let imageUrl = null;

        // Compress and Upload image - Required
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Optimizing image...</span>';
        try {
            const compressedFile = await compressImage(selectedImageFile);
            submitBtn.innerHTML = '<div class="spinner"></div> <span>Uploading...</span>';
            imageUrl = await uploadImageToCloudinary(compressedFile);
        } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
            showToast('Image upload failed. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Send Alert</span>';
            return;
        }

        submitBtn.innerHTML = '<div class="spinner"></div> <span>Saving report...</span>';

        // Create emergency report
        const reportData = {
            userId: currentUser.uid,
            userName: currentUser.name,
            userPhone: currentUser.phone,
            userAddress: currentUser.address,
            type: window.selectedEmergencyType,
            description: description,
            imageUrl: imageUrl,
            location: {
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                accuracy: currentLocation.accuracy
            },
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('emergencyReports').add(reportData);

        showToast('Emergency alert sent successfully!', 'success');

        setTimeout(() => {
            closeModal();
            currentPage = 1;
            loadMyReports();
        }, 1000);

    } catch (error) {
        console.error('Error submitting emergency report:', error);
        showToast('Error sending emergency alert. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg><span>Send Emergency Alert</span>';
    }
});

// Load My Reports
async function loadMyReports() {
    if (!currentUser) return;

    try {
        const reportsSnapshot = await db.collection('emergencyReports')
            .where('userId', '==', currentUser.uid)
            .get();

        const reportsList = document.getElementById('myReportsList');
        const paginationContainer = document.getElementById('myReportsPagination');

        if (reportsSnapshot.empty) {
            reportsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No reports yet</p>';
            paginationContainer.innerHTML = '';
            return;
        }

        // Convert to array and sort client-side
        const reports = [];
        reportsSnapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });

        // Sort by createdAt descending
        reports.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        const totalItems = reports.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        // Ensure currentPage is within bounds
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedReports = reports.slice(startIndex, endIndex);

        reportsList.innerHTML = '';
        // Display paginated items
        paginatedReports.forEach(report => {
            const emergency = EMERGENCY_TYPES[report.type] || { icon: '⚠️', label: 'Emergency' };
            const hasImage = report.imageUrl ? '<span style="font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.05);">📷 Attached Image</span>' : '';

            const reportItem = document.createElement('div');
            reportItem.className = 'report-item';
            reportItem.onclick = () => viewReportDetails({ ...report, reportId: report.id || report.reportId });
            reportItem.innerHTML = `
                <div class="report-status ${report.status}"></div>
                <div class="report-content">
                    <div class="report-type">${emergency.icon} ${emergency.label} Report ${hasImage}</div>
                    <div class="report-desc">${report.description}</div>
                    <div class="report-time">${formatTimestamp(report.createdAt)} • ${STATUS_LABELS[report.status] || report.status}</div>
                </div>
            `;

            reportsList.appendChild(reportItem);
        });

        renderPagination(totalPages);

    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Error loading reports', 'error');
    }
}

// Function to view report details in iOS 26 Modal
let _responderUnsubscribe = null;  // Firestore listener cleanup
let _responderMap = null;          // Leaflet map instance for responder

window.viewReportDetails = function (report) {
    const reportId = report.id || report.reportId;
    const modal = document.getElementById('reportDetailsModal');
    const typeLabel = EMERGENCY_TYPES[report.type]?.label || 'Emergency';
    const typeIcon = EMERGENCY_TYPES[report.type]?.icon || '⚠️';

    document.getElementById('detailType').textContent = `${typeLabel} Report`;
    document.getElementById('detailIcon').textContent = typeIcon;
    document.getElementById('detailTime').textContent = formatTimestamp(report.createdAt);
    document.getElementById('detailDescription').textContent = report.description;

    const statusChip = document.getElementById('detailStatus');
    statusChip.textContent = (STATUS_LABELS[report.status] || report.status).toUpperCase();
    statusChip.className = `status-chip ${report.status}`;

    // Handle Image
    const imgSection = document.getElementById('detailImageSection');
    const imgElement = document.getElementById('detailImage');
    if (report.imageUrl) {
        imgElement.src = report.imageUrl;
        imgElement.style.cursor = 'zoom-in';
        imgElement.onclick = () => window.openFullscreenImage(report.imageUrl);
        imgSection.style.display = 'block';
    } else {
        imgSection.style.display = 'none';
    }

    // Handle Response Info text
    const responseInfo = document.getElementById('detailResponseInfo');
    if (report.status === 'pending') {
        responseInfo.textContent = "Our responders are currently reviewing your report. Please stay in a safe place.";
        responseInfo.className = "glass-box-text info pending";
    } else if (report.status === 'responding') {
        responseInfo.textContent = "🚨 Responders are on their way to your location. Keep your phone reachable.";
        responseInfo.className = "glass-box-text info responding";
    } else {
        responseInfo.textContent = "This incident has been marked as resolved. Thank you for your cooperation.";
        responseInfo.className = "glass-box-text info resolved";
    }

    // ── Live Responder Map ──────────────────────────
    const liveSection = document.getElementById('liveResponderSection');
    const etaText = document.getElementById('responderEtaText');

    // Clean up previous listener & map
    if (_responderUnsubscribe) { _responderUnsubscribe(); _responderUnsubscribe = null; }
    if (_responderMap) { _responderMap.remove(); _responderMap = null; }
    document.getElementById('liveResponderMap').innerHTML = '';

    if (report.status === 'responding' && reportId) {
        liveSection.style.display = 'block';
        etaText.textContent = 'Locating responder...';

        let responderMarker = null;
        let victimMarker = null;
        let routeLine = null;
        let mapReady = false;

        // Listen to real-time responder location on the Firestore doc
        _responderUnsubscribe = db.collection('emergencyReports')
            .doc(reportId)
            .onSnapshot(snap => {
                const data = snap.data();
                const loc = data?.responderLocation;
                if (!loc) { etaText.textContent = 'Waiting for responder GPS...'; return; }

                const rLat = loc.lat, rLng = loc.lng;
                const vLat = report.location?.lat, vLng = report.location?.lng;

                if (!mapReady) {
                    mapReady = true;
                    setTimeout(() => {
                        _responderMap = L.map('liveResponderMap').setView([rLat, rLng], 15);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            { attribution: '© OSM', maxZoom: 19 }).addTo(_responderMap);

                        // Responder marker (animated pulse)
                        const rIcon = L.divIcon({
                            html: `<div style="position:relative;">
                                <div style="width:16px;height:16px;background:#EE4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(238,68,68,0.6);"></div>
                                <div style="position:absolute;top:-4px;left:-4px;width:24px;height:24px;border:2px solid #EE4444;border-radius:50%;animation:statusPulse 1.5s infinite;opacity:0.5;"></div>
                            </div>`,
                            className: '', iconSize: [16, 16], iconAnchor: [8, 8]
                        });
                        responderMarker = L.marker([rLat, rLng], { icon: rIcon })
                            .addTo(_responderMap)
                            .bindPopup('<b>🚨 Responder</b>');

                        // Victim marker
                        if (vLat && vLng) {
                            const vIcon = L.divIcon({
                                html: `<div style="background:#3B82F6;color:white;padding:5px 10px;border-radius:16px;font-size:11px;font-weight:700;white-space:nowrap;border:2px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.5);">📍 You</div>`,
                                className: '', iconAnchor: [30, 18]
                            });
                            victimMarker = L.marker([vLat, vLng], { icon: vIcon })
                                .addTo(_responderMap)
                                .bindPopup('<b>📍 Your Location</b>');
                        }

                        updateRoute(rLat, rLng, vLat, vLng);
                    }, 150);

                } else if (responderMarker) {
                    // Smoothly move responder marker
                    responderMarker.setLatLng([rLat, rLng]);
                    updateRoute(rLat, rLng, vLat, vLng);
                }
            });

        // Draw OSRM route + compute ETA
        async function updateRoute(rLat, rLng, vLat, vLng) {
            if (!vLat || !vLng || !_responderMap) return;
            try {
                const url = `https://router.project-osrm.org/route/v1/driving/${rLng},${rLat};${vLng},${vLat}?overview=full&geometries=geojson`;
                const res = await fetch(url);
                const data = await res.json();
                if (!data.routes?.length) return;

                const route = data.routes[0];
                const distKm = (route.distance / 1000).toFixed(1);
                const mins = Math.max(1, Math.round(route.duration / 60));
                etaText.textContent = `Responder is ~${distKm} km away · ETA ${mins} min`;

                if (routeLine) _responderMap.removeLayer(routeLine);
                routeLine = L.geoJSON(route.geometry, {
                    style: { color: '#EE4444', weight: 4, opacity: 0.8, dashArray: '8 4', lineCap: 'round' }
                }).addTo(_responderMap);

                _responderMap.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
            } catch (_) { }
        }

    } else {
        liveSection.style.display = 'none';
    }

    modal.classList.add('active');
}

// Render Pagination Controls
function renderPagination(totalPages) {
    const container = document.getElementById('myReportsPagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Previous Button
    html += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M15 18l-6-6 6-6"/></svg>
    </button>`;

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    // Next Button
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 18l6-6-6-6"/></svg>
    </button>`;

    container.innerHTML = html;
}

// Global function to handle page change
window.changePage = (page) => {
    currentPage = page;
    loadMyReports();
};

// Refresh Reports
document.getElementById('refreshReportsBtn').addEventListener('click', loadMyReports);
// Force Update (Clear Cache & Hard Refresh)
document.getElementById('forceUpdateBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('forceUpdateBtn');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Updating...';

    try {
        // 1. Clear Service Worker Caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            console.log("Caches cleared");
        }

        // 2. Unregister Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) {
                await reg.unregister();
            }
            console.log("Service workers unregistered");
        }

        // 3. Clear Local Storage (Except auth/version)
        const currentLocalUser = localStorage.getItem('currentUser');
        const currentSessionUser = sessionStorage.getItem('currentUser');
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        const theme = localStorage.getItem('theme');

        localStorage.clear();
        sessionStorage.clear();

        if (currentLocalUser) localStorage.setItem('currentUser', currentLocalUser);
        if (currentSessionUser) sessionStorage.setItem('currentUser', currentSessionUser);
        if (rememberedEmail) localStorage.setItem('rememberedEmail', rememberedEmail);
        if (theme) localStorage.setItem('theme', theme);

        showToast('Cache cleared! Refreshing...', 'success');

        setTimeout(() => {
            // Hard refresh
            window.location.reload(true);
        }, 1000);
    } catch (error) {
        console.error("Force update failed:", error);
        btn.disabled = false;
        btn.innerHTML = originalText;
        showToast('Update failed. Try manually refreshing.', 'error');
    }
});

// ── Full-screen Image Viewer Logic ─────────────────────
(function initImageViewer() {
    let currentZoom = 1;
    let isDragging = false;
    let startX, startY;
    let translateX = 0;
    let translateY = 0;

    const modal = document.getElementById('imageViewerModal');
    const viewerImg = document.getElementById('viewerImage');
    const viewerContent = document.getElementById('viewerContent');
    const zoomBadge = document.getElementById('zoomBadge');

    if (!modal || !viewerImg) return;

    window.openFullscreenImage = function (src) {
        viewerImg.src = src;
        currentZoom = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    function closeFullscreenImage() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function updateTransform() {
        requestAnimationFrame(() => {
            viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
            if (zoomBadge) zoomBadge.textContent = `${Math.round(currentZoom * 100)}%`;
        });
    }

    document.getElementById('closeViewer')?.addEventListener('click', closeFullscreenImage);

    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
        if (currentZoom < 4) {
            currentZoom += 0.5;
            updateTransform();
        }
    });

    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
        if (currentZoom > 0.5) {
            currentZoom -= 0.5;
            updateTransform();
        }
    });

    document.getElementById('resetZoomBtn')?.addEventListener('click', () => {
        currentZoom = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target === viewerContent) closeFullscreenImage();
    });

    // Drag / Pan Logic
    const handleStart = (e) => {
        if (currentZoom <= 1.05) return;
        isDragging = true;
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        startX = clientX - translateX;
        startY = clientY - translateY;
        viewerImg.style.transition = 'none';
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        const clientX = e.clientX || e.touches?.[0].clientX;
        const clientY = e.clientY || e.touches?.[0].clientY;
        if (clientX === undefined) return;

        translateX = clientX - startX;
        translateY = clientY - startY;
        updateTransform();
    };

    const handleEnd = () => {
        isDragging = false;
        viewerImg.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)';
    };

    viewerContent.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    viewerContent.addEventListener('touchstart', handleStart, { passive: true });
    viewerContent.addEventListener('touchmove', handleMove, { passive: true });
    viewerContent.addEventListener('touchend', handleEnd);
})();
