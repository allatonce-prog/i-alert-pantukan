// Resident Dashboard Logic

let currentUser = null;
let currentLocation = null;
let map = null;
let marker = null;
let selectedEmergencyType = null;

// Check authentication
async function checkAuth() {
    const userJson = localStorage.getItem('currentUser');
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
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
});

// Emergency Card Click Handler
document.querySelectorAll('.emergency-card').forEach(card => {
    card.addEventListener('click', () => {
        selectedEmergencyType = card.dataset.type;
        openEmergencyModal();
    });
});

// Open Emergency Modal
function openEmergencyModal() {
    const modal = document.getElementById('emergencyModal');
    const modalIcon = document.getElementById('modalEmergencyIcon');
    const modalType = document.getElementById('modalEmergencyType');

    const emergency = EMERGENCY_TYPES[selectedEmergencyType];
    modalIcon.textContent = emergency.icon;
    modalType.textContent = emergency.label;

    // Set modal type for category-specific "effects"
    modal.dataset.type = selectedEmergencyType;

    // Reset form
    document.getElementById('emergencyForm').reset();
    document.getElementById('locationText').textContent = 'Click the button above to get your current location';
    currentLocation = null;

    // Initialize map
    setTimeout(() => {
        initMap();
    }, 100);

    modal.classList.add('active');
}

// Close Modal
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);

function closeModal() {
    const modal = document.getElementById('emergencyModal');
    modal.classList.remove('active');
    modal.dataset.type = ''; // Reset type
    if (map) {
        map.remove();
        map = null;
        marker = null;
    }
}

// Initialize Map
function initMap() {
    const mapElement = document.getElementById('map');

    // Default to Pantukan coordinates
    const defaultLat = 7.1881;
    const defaultLng = 126.0633;

    if (map) {
        map.remove();
    }

    map = L.map('map').setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add marker if location is already set
    if (currentLocation) {
        marker = L.marker([currentLocation.lat, currentLocation.lng]).addTo(map);
        map.setView([currentLocation.lat, currentLocation.lng], 15);
    }
}

// Request location transparently on background
function requestBackgroundLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            console.log('Background GPS location acquired successfully.');
            // Optionally, if the user opens the map quickly, the marker handles it.
        },
        (error) => {
            console.error('Background GPS location failed or denied:', error);
            // Don't show an intrusive toast here unless requested, 
            // the user can manually click 'Get Location' in the form if needed.
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Get Current Location via Button
document.getElementById('getLocationBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }

    const btn = document.getElementById('getLocationBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Getting location...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };

            // Update map
            if (map) {
                if (marker) {
                    map.removeLayer(marker);
                }

                marker = L.marker([currentLocation.lat, currentLocation.lng]).addTo(map);
                map.setView([currentLocation.lat, currentLocation.lng], 15);

                // Add circle to show accuracy
                L.circle([currentLocation.lat, currentLocation.lng], {
                    radius: currentLocation.accuracy,
                    color: '#DC2626',
                    fillColor: '#DC2626',
                    fillOpacity: 0.1
                }).addTo(map);
            }

            document.getElementById('locationText').textContent =
                `Location acquired (±${Math.round(currentLocation.accuracy)}m accuracy)`;

            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg> Update Location';

            showToast('Location acquired successfully', 'success');
        },
        (error) => {
            console.error('Geolocation error:', error);
            let errorMessage = 'Unable to get your location';

            if (error.code === 1) {
                errorMessage = 'Location permission denied';
            } else if (error.code === 2) {
                errorMessage = 'Location unavailable';
            } else if (error.code === 3) {
                errorMessage = 'Location request timed out';
            }

            showToast(errorMessage, 'error');
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg> Get Current Location';
        }
    );
});

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
                facingMode: facingMode
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

// Upload Image to Cloudinary
async function uploadImageToCloudinary(file) {
    const cloudName = 'djghkklph';
    const apiKey = '613592386419746';
    const apiSecret = 'CSrGl9AN4MNyylk_4Zb2UA7S22g'; // Note: Exposed secret is insecure for production
    const timestamp = Math.round((new Date()).getTime() / 1000);

    // Generate signature
    // Parameters to sign: timestamp (sorted alphabetically)
    const paramsToSign = `timestamp=${timestamp}${apiSecret}`;
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

    if (!currentLocation) {
        showToast('Please provide your location first', 'warning');
        return;
    }

    const submitBtn = document.getElementById('submitEmergency');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> <span>Sending alert...</span>';

    try {
        let imageUrl = null;

        // Upload image if selected
        if (selectedImageFile) {
            submitBtn.innerHTML = '<div class="spinner"></div> <span>Uploading image...</span>';
            try {
                imageUrl = await uploadImageToCloudinary(selectedImageFile);
            } catch (uploadError) {
                console.error('Image upload failed, continuing without image:', uploadError);
                showToast('Image upload failed, sending report without image', 'warning');
            }
        }

        submitBtn.innerHTML = '<div class="spinner"></div> <span>Saving report...</span>';

        // Get user data
        const userDoc = await db.collection('USERS').doc(currentUser.uid).get();
        const userData = userDoc.data();

        // Create emergency report
        const reportData = {
            userId: currentUser.uid,
            userName: userData.name,
            userPhone: userData.phone,
            userAddress: userData.address,
            type: selectedEmergencyType,
            description: description,
            imageUrl: imageUrl, // Add image URL if exists
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
        // Fetch reports without ordering to avoid "Requires Index" error
        const reportsSnapshot = await db.collection('emergencyReports')
            .where('userId', '==', currentUser.uid)
            .get();

        const reportsList = document.getElementById('myReportsList');

        if (reportsSnapshot.empty) {
            reportsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No reports yet</p>';
            return;
        }

        reportsList.innerHTML = '';

        // Convert to array and sort client-side
        const reports = [];
        reportsSnapshot.forEach(doc => {
            reports.push(doc.data());
        });

        // Sort by createdAt descending
        reports.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        // Display top 10
        reports.slice(0, 10).forEach(report => {
            const emergency = EMERGENCY_TYPES[report.type];
            const hasImage = report.imageUrl ? '<span style="font-size: 12px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 8px;">📷 Image</span>' : '';

            const reportItem = document.createElement('div');
            reportItem.className = 'report-item';
            reportItem.innerHTML = `
                <div class="report-status ${report.status}"></div>
                <div class="report-content">
                    <div class="report-type">${emergency.icon} ${emergency.label} ${hasImage}</div>
                    <div class="report-desc">${report.description}</div>
                    <div class="report-time">${formatTimestamp(report.createdAt)} • ${STATUS_LABELS[report.status]}</div>
                </div>
            `;

            reportsList.appendChild(reportItem);
        });

    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Error loading reports', 'error');
    }
}

// Refresh Reports
document.getElementById('refreshReportsBtn').addEventListener('click', loadMyReports);
