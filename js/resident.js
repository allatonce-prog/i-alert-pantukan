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

            // Load user's reports
            loadMyReports();
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
    document.getElementById('emergencyModal').classList.remove('active');
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

// Get Current Location
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

            const reportItem = document.createElement('div');
            reportItem.className = 'report-item';
            reportItem.innerHTML = `
                <div class="report-status ${report.status}"></div>
                <div class="report-content">
                    <div class="report-type">${emergency.icon} ${emergency.label}</div>
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
