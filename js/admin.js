// Admin Dashboard Logic

let currentAdmin = null;
let adminDepartment = null;
let reportsListener = null;
let currentStatusFilter = 'pending';

// Live Map Variables
let adminMap = null;
let mapMarkers = {};
let mapListener = null;
let isAudioEnabled = false;
const alertSound = new Audio('sound/emergency-alert.mp3');

// Pagination Variables
let currentHistoryPage = 1;
const historyPageSize = 4;
let allHistoryData = []; // Store fetched data locally for client-side pagination

// Analytics Charts
let trendsChart = null;
let distributionChart = null;
let analyticsReports = [];

// Helper: Unlock audio on mobile (triggered by first user click)
function unlockAudio() {
    if (isAudioEnabled) return;

    // Play a silent or very short sound to unlock the audio context
    alertSound.volume = 0;
    alertSound.play().then(() => {
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.volume = 1; // Restore volume for future use
        isAudioEnabled = true;
        console.log("Audio unlocked for mobile");
    }).catch(e => console.log("Audio unlock failed:", e));
}

// Global click listener for first-time audio activation
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

// Check authentication
async function checkAuth() {
    const userJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (!userJson) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(userJson);

    try {
        // Check ADMIN collection
        // Note: The ID is stored in the local object
        if (!user.id) {
            throw new Error('Invalid user session');
        }

        const userDoc = await db.collection('ADMIN').doc(user.id).get();

        if (userDoc.exists) {
            const userData = userDoc.data();

            // Redirect non-admin users
            if (userData.role !== 'admin') {
                window.location.href = 'resident.html';
                return;
            }

            currentAdmin = { uid: userDoc.id, ...userData };
            adminDepartment = userData.department;

            // Update UI
            const deptInfo = EMERGENCY_TYPES[adminDepartment];
            if (document.getElementById('departmentName')) {
                document.getElementById('departmentName').textContent = deptInfo ? deptInfo.label : 'Admin Panel';
            }

            // Update Navbar Info
            if (document.getElementById('adminNameDisplay')) {
                document.getElementById('adminNameDisplay').textContent = userData.name || 'Administrator';
            }
            if (document.getElementById('adminEmailDisplay')) {
                document.getElementById('adminEmailDisplay').textContent = userData.email || '';
            }

            // Load dashboard
            loadDashboard();
            startRealtimeListener();
        } else {
            // User document doesn't exist (deleted?)
            localStorage.removeItem('currentUser');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Error loading admin data:', error);
        showToast('Error loading admin data', 'error');
        // Optional: clear session if error persists
    }
}

// Initialize
checkAuth();

// User Menu Logic
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');

// Toggle User Menu
if (userMenuBtn) {
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (userMenuBtn && userDropdown && !userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('active');
    }
});

// Profile Management
const profileBtn = document.getElementById('openProfileBtn');
const profileModal = document.getElementById('profileModal');
const profileForm = document.getElementById('profileForm');
const closeProfileModalBtn = document.getElementById('closeProfileModal');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');

// Open Profile Modal
if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userDropdown.classList.remove('active');

        // Fill current data
        if (currentAdmin) {
            document.getElementById('profileName').value = currentAdmin.name || '';
            document.getElementById('profileEmail').value = currentAdmin.email || '';
            document.getElementById('profileDepartment').value = currentAdmin.department || '';
            document.getElementById('profilePassword').value = ''; // Clear password field
        }

        profileModal.classList.add('active');
    });
}

// Close Profile Modal
function closeProfileModal() {
    profileModal.classList.remove('active');
    profileForm.reset();
}

if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeProfileModal);

// Close Profile Modal on Backdrop Click
if (profileModal) {
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) closeProfileModal();
    });
}

// Handle Profile Update
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('saveProfileBtn');
        const originalBtnContent = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner"></div> Saving...';

        const updates = {
            name: document.getElementById('profileName').value
        };

        const newPassword = document.getElementById('profilePassword').value;
        if (newPassword) {
            updates.password = newPassword;
        }

        try {
            // Update Firestore (ADMIN collection)
            await db.collection('ADMIN').doc(currentAdmin.uid).update(updates);

            // Update Local State and Storage
            const updatedAdmin = { ...currentAdmin, ...updates };
            delete updatedAdmin.password; // Don't store password in local state
            currentAdmin = updatedAdmin;
            localStorage.setItem('currentUser', JSON.stringify(updatedAdmin));

            // Update UI if needed (e.g. sidebar name if we showed it)

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
}

// Settings Management
const settingsBtn = document.getElementById('openSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

// Open Settings
if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        userDropdown.classList.remove('active');
        settingsModal.classList.add('active');
    });
}

// Close Settings
function closeSettings() {
    settingsModal.classList.remove('active');
}

if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettings);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);

// Close Settings Modal on Backdrop Click
if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });
}

// Dark Mode Logic
function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';
    applyTheme(isDark);
    if (darkModeToggle) {
        darkModeToggle.checked = isDark;
    }
}

function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        // document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0f172a');
    } else {
        document.body.classList.remove('dark-mode');
        // document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ffffff');
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

// Initialize Theme
document.addEventListener('DOMContentLoaded', initTheme);

// Logout Handler
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        try {
            if (reportsListener) {
                reportsListener(); // Unsubscribe from listener
            }
            localStorage.removeItem('currentUser');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
            showToast('Error logging out', 'error');
        }
    });
}

// Navigation
// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;

        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Update active page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}Page`).classList.add('active');

        // Close sidebar on mobile
        document.querySelector('.sidebar').classList.remove('mobile-open');
        document.getElementById('sidebarOverlay').classList.remove('active');

        // Load page data
        if (page === 'reports') {
            loadReports();
        } else if (page === 'history') {
            loadHistory();
        } else if (page === 'analytics') {
            loadAnalytics();
        } else if (page === 'map') {
            initAdminMap();
        }
    });
});

// Analytics Filter Listeners
document.getElementById('analyticsTimeFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;

    // UI Toggle
    const tabs = e.currentTarget.querySelectorAll('.filter-tab');
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Update Data
    loadAnalytics();
});

// Mobile Menu Toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        sidebarOverlay.classList.toggle('active');
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
    });
}

// Load Dashboard
async function loadDashboard() {
    try {
        const filterVal = document.getElementById('dashboardDateFilter')?.value || 'month';
        const now = new Date();
        let startDate, endDate;

        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (filterVal === 'today') {
            startDate = startOfToday;
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        } else if (filterVal === 'yesterday') {
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59);
        } else if (filterVal === 'week') {
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - now.getDay()); // Start of week (Sunday)
            endDate = now;
        } else if (filterVal === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = now;
        } else if (filterVal === 'custom') {
            const startStr = document.getElementById('startDate').value;
            const endStr = document.getElementById('endDate').value;
            if (!startStr || !endStr) return; // Wait for both dates

            startDate = new Date(startStr);
            endDate = new Date(endStr);
            endDate.setHours(23, 59, 59);
        }

        // Get reports for this department (and 'other' unclassified emergencies)
        const allReports = await db.collection('emergencyReports')
            .where('type', 'in', [adminDepartment, 'other'])
            .get();

        let pendingCount = 0;
        let respondingCount = 0;
        let resolvedCount = 0;
        let totalCount = 0;

        allReports.forEach(doc => {
            const report = doc.data();
            const reportDate = report.createdAt ? report.createdAt.toDate() : new Date();

            const isWithinRange = reportDate >= startDate && reportDate <= endDate;

            if (isWithinRange) {
                totalCount++;
                if (report.status === 'resolved') resolvedCount++;
            }

            // Always count active reports regardless of date for situational awareness
            if (report.status === 'pending') pendingCount++;
            if (report.status === 'responding') respondingCount++;
        });

        // Update stats
        document.getElementById('statPending').textContent = pendingCount;
        document.getElementById('statResponding').textContent = respondingCount;
        document.getElementById('statResolved').textContent = resolvedCount;
        document.getElementById('statTotal').textContent = totalCount;
        document.getElementById('pendingBadge').textContent = pendingCount;

        // Dynamic Labels
        const resolvedLabel = document.querySelector('.stat-card.resolved p');
        const totalLabel = document.querySelector('.stat-card.total p');

        if (filterVal === 'today') {
            resolvedLabel.textContent = 'Resolved Today';
            totalLabel.textContent = 'Total Today';
        } else if (filterVal === 'yesterday') {
            resolvedLabel.textContent = 'Resolved Yesterday';
            totalLabel.textContent = 'Total Yesterday';
        } else if (filterVal === 'week') {
            resolvedLabel.textContent = 'Resolved This Week';
            totalLabel.textContent = 'Total This Week';
        } else if (filterVal === 'month') {
            resolvedLabel.textContent = 'Resolved This Month';
            totalLabel.textContent = 'Total This Month';
        } else {
            resolvedLabel.textContent = 'Resolved (Selected Range)';
            totalLabel.textContent = 'Total (Selected Range)';
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

// Dashboard Filter Event Listeners
const dashboardDateFilter = document.getElementById('dashboardDateFilter');
const customDateRange = document.getElementById('customDateRange');

if (dashboardDateFilter) {
    dashboardDateFilter.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            loadDashboard();
        }
    });
}

document.getElementById('startDate')?.addEventListener('change', loadDashboard);
document.getElementById('endDate')?.addEventListener('change', loadDashboard);

// Load Reports Page
async function loadReports(statusFilter = currentStatusFilter) {
    currentStatusFilter = statusFilter;
    try {
        let query = db.collection('emergencyReports')
            .where('type', 'in', [adminDepartment, 'other']);
        // Removed .orderBy('createdAt', 'desc') to avoid index error

        if (statusFilter !== 'all') {
            query = query.where('status', '==', statusFilter);
        }

        const reportsSnapshot = await query.get();
        const reportsList = document.getElementById('reportsList');

        if (reportsSnapshot.empty) {
            reportsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No reports found</p>';
            return;
        }

        // Convert key-value snapshot to array for sorting
        let reports = [];
        reportsSnapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });

        // Client-side Sort: Newest first
        reports.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        reportsList.innerHTML = '';

        reports.forEach(report => {
            const emergency = EMERGENCY_TYPES[report.type];

            const reportCard = document.createElement('div');
            reportCard.className = `alert-item alert-status-${report.status}`;
            reportCard.innerHTML = `
                <div class="alert-icon ${report.type}">
                    ${emergency.icon}
                </div>
                <div class="alert-content">
                    <div class="alert-header">
                        <span class="alert-type">${emergency.label}</span>
                        <span class="alert-status ${report.status}">${STATUS_LABELS[report.status]}</span>
                    </div>
                    <div class="alert-desc">${report.description}</div>
                    <div class="alert-meta">
                        <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            ${report.userName}
                        </span>
                        <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            ${report.userPhone}
                        </span>
                        <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            ${formatTimestamp(report.createdAt)}
                        </span>
                    </div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-primary btn-sm" onclick="viewReportDetails('${report.id}')">
                        <span class="desktop-only">View </span>Details
                    </button>
                </div>
            `;

            reportsList.appendChild(reportCard);
        });

    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Error loading reports', 'error');
    }
}

// Status Filter Tabs Logic
const statusFilterTabs = document.getElementById('statusFilterTabs');
if (statusFilterTabs) {
    const tabs = statusFilterTabs.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadReports(tab.dataset.status);
        });
    });
}

// View Report Details
window.viewReportDetails = async function (reportId) {
    try {
        const reportDoc = await db.collection('emergencyReports').doc(reportId).get();

        if (!reportDoc.exists) {
            showToast('Report not found', 'error');
            return;
        }

        const report = reportDoc.data();
        const emergency = EMERGENCY_TYPES[report.type];

        const detailsHtml = `
            <div style="padding: var(--spacing-lg);">
                <div style="display: flex; align-items: center; gap: var(--spacing-lg); margin-bottom: var(--spacing-xl); padding: var(--spacing-lg); background: rgba(255,255,255,0.02); border-radius: var(--border-radius-md);">
                    <div style="font-size: 48px;">${emergency.icon}</div>
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 var(--spacing-xs) 0; color: var(--color-text-primary);">${emergency.label}</h3>
                        <span class="alert-status ${report.status}" style="display: inline-block;">${STATUS_LABELS[report.status]}</span>
                    </div>
                </div>
                
                <div style="margin-bottom: var(--spacing-xl);">
                    <h4 style="color: var(--color-text-primary); margin-bottom: var(--spacing-md);">Description</h4>
                    <p style="color: var(--color-text-secondary); line-height: 1.6;">${report.description}</p>
                </div>
                
                <div style="margin-bottom: var(--spacing-xl);">
                    <h4 style="color: var(--color-text-primary); margin-bottom: var(--spacing-md);">Reporter Information</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                        <div>
                            <p style="color: var(--color-text-muted); font-size: var(--font-size-sm); margin-bottom: var(--spacing-xs);">Name</p>
                            <p style="color: var(--color-text-primary); font-weight: 600; margin: 0;">${report.userName}</p>
                        </div>
                        <div>
                            <p style="color: var(--color-text-muted); font-size: var(--font-size-sm); margin-bottom: var(--spacing-xs);">Phone</p>
                            <p style="color: var(--color-text-primary); font-weight: 600; margin: 0;">${report.userPhone}</p>
                        </div>
                        <div>
                            <p style="color: var(--color-text-muted); font-size: var(--font-size-sm); margin-bottom: var(--spacing-xs);">Address</p>
                            <p style="color: var(--color-text-primary); font-weight: 600; margin: 0;">${report.userAddress}</p>
                        </div>
                        <div>
                            <p style="color: var(--color-text-muted); font-size: var(--font-size-sm); margin-bottom: var(--spacing-xs);">Reported</p>
                            <p style="color: var(--color-text-primary); font-weight: 600; margin: 0;">${formatFullDate(report.createdAt)}</p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: var(--spacing-xl);">
                    <h4 style="color: var(--color-text-primary); margin-bottom: var(--spacing-md);">Location</h4>
                    <div id="detailMap" style="width: 100%; height: 300px; border-radius: var(--border-radius-md); margin-bottom: var(--spacing-md);"></div>
                    <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm);">
                        Coordinates: ${report.location.lat.toFixed(6)}, ${report.location.lng.toFixed(6)} (±${Math.round(report.location.accuracy)}m)
                    </p>
                </div>

                ${report.imageUrl ? `
                <div style="margin-bottom: var(--spacing-xl);">
                    <h4 style="color: var(--color-text-primary); margin-bottom: var(--spacing-md);">Proof Image</h4>
                    <div style="border-radius: var(--border-radius-md); overflow: hidden; border: 1px solid rgba(255,255,255,0.1); cursor: zoom-in;" onclick="window.openFullscreenImage('${report.imageUrl}')">
                        <img src="${report.imageUrl}" alt="Emergency Proof" style="width: 100%; max-height: 400px; object-fit: contain; background: black; display: block;">
                    </div>
                </div>
                ` : ''}
                
                <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                    ${report.status === 'pending' ? `
                        <button class="btn btn-primary" style="width: 100%; justify-content: center;" onclick="updateReportStatus('${reportId}', 'responding')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                            Start Response
                        </button>
                    ` : ''}
                    ${report.status === 'responding' ? `
                        <button class="btn btn-success" style="width: 100%; justify-content: center;" onclick="updateReportStatus('${reportId}', 'resolved')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            Mark as Resolved
                        </button>
                    ` : ''}
                    <div style="display: flex; gap: var(--spacing-sm);">
                        <a href="tel:${report.userPhone}" class="btn btn-secondary" style="flex: 1; justify-content: center;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            Call
                        </a>
                        <a href="https://www.google.com/maps?q=${report.location.lat},${report.location.lng}" target="_blank" class="btn btn-secondary" style="flex: 1; justify-content: center;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            Map
                        </a>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('reportDetails').innerHTML = detailsHtml;
        document.getElementById('reportModal').classList.add('active');

        // Initialize map in modal
        setTimeout(() => {
            const detailMap = L.map('detailMap').setView([report.location.lat, report.location.lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(detailMap);
            L.marker([report.location.lat, report.location.lng]).addTo(detailMap);
            L.circle([report.location.lat, report.location.lng], {
                radius: report.location.accuracy,
                color: '#DC2626',
                fillColor: '#DC2626',
                fillOpacity: 0.2
            }).addTo(detailMap);
        }, 100);

    } catch (error) {
        console.error('Error loading report details:', error);
        showToast('Error loading report details', 'error');
    }
};

// Live GPS broadcasting state
let _gpsWatchId = null;
let _gpsReportId = null;
let _gpsUpdateInterval = null;

function startResponderGPS(reportId) {
    stopResponderGPS(); // clear any previous
    _gpsReportId = reportId;

    if (!navigator.geolocation) {
        showToast('GPS not available on this device', 'error');
        return;
    }

    // Immediately get and push location, then every 5 seconds
    _gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            db.collection('emergencyReports').doc(reportId).update({
                responderLocation: {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                },
                responderName: currentAdmin?.name || 'Responder'
            }).catch(e => console.warn('GPS update failed:', e));
        },
        err => console.warn('GPS error:', err),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    showToast('📡 Broadcasting your live location to resident', 'success');
}

function stopResponderGPS() {
    if (_gpsWatchId !== null) {
        navigator.geolocation.clearWatch(_gpsWatchId);
        _gpsWatchId = null;
    }
    if (_gpsReportId) {
        // Clear responder location from report when resolved/stopped
        db.collection('emergencyReports').doc(_gpsReportId).update({
            responderLocation: firebase.firestore.FieldValue.delete()
        }).catch(() => { });
        _gpsReportId = null;
    }
}

// Update Report Status
window.updateReportStatus = async function (reportId, newStatus) {
    try {
        await db.collection('emergencyReports').doc(reportId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`Report marked as ${STATUS_LABELS[newStatus]}`, 'success');

        // Start GPS broadcasting when responding
        if (newStatus === 'responding') {
            startResponderGPS(reportId);
        }

        // Stop GPS when resolved
        if (newStatus === 'resolved') {
            stopResponderGPS();
        }

        // Close modal and refresh
        document.getElementById('reportModal').classList.remove('active');
        loadDashboard();

        // Refresh reports list if we are on the reports page
        const reportsPage = document.getElementById('reportsPage');
        if (reportsPage && reportsPage.classList.contains('active')) {
            loadReports();
        }

    } catch (error) {
        console.error('Error updating report status:', error);
        showToast('Error updating report status', 'error');
    }
};


// Close Report Modal
document.getElementById('closeReportModal').addEventListener('click', () => {
    document.getElementById('reportModal').classList.remove('active');
});

// Close Report Modal on Backdrop Click
document.getElementById('reportModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'reportModal') {
        document.getElementById('reportModal').classList.remove('active');
    }
});

// Load History
async function loadHistory(page = 1) {
    currentHistoryPage = page;
    try {
        const historyList = document.getElementById('historyList');
        const paginationContainer = document.getElementById('historyPagination');

        // Only fetch from DB if we don't have it or need a refresh
        if (allHistoryData.length === 0 || page === 1) {
            historyList.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Loading history...</p></div>';

            const historySnapshot = await db.collection('emergencyReports')
                .where('type', 'in', [adminDepartment, 'other'])
                .where('status', '==', 'resolved')
                .get();

            allHistoryData = [];
            historySnapshot.forEach(doc => {
                allHistoryData.push({ id: doc.id, ...doc.data() });
            });

            // Sort by updatedAt desc
            allHistoryData.sort((a, b) => {
                const dateA = a.updatedAt ? a.updatedAt.toDate() : new Date(0);
                const dateB = b.updatedAt ? b.updatedAt.toDate() : new Date(0);
                return dateB - dateA;
            });
        }

        if (allHistoryData.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No history yet</p>';
            paginationContainer.innerHTML = '';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(allHistoryData.length / historyPageSize);
        const startIndex = (currentHistoryPage - 1) * historyPageSize;
        const endIndex = startIndex + historyPageSize;
        const paginatedHistory = allHistoryData.slice(startIndex, endIndex);

        historyList.innerHTML = '';

        paginatedHistory.forEach(report => {
            const emergency = EMERGENCY_TYPES[report.type];
            const historyItem = document.createElement('div');
            historyItem.className = 'alert-item alert-status-resolved';
            historyItem.innerHTML = `
                <div class="alert-icon ${report.type}">${emergency.icon}</div>
                <div class="alert-content">
                    <div class="alert-header">
                        <span class="alert-type">${emergency.label}</span>
                        <span class="alert-status resolved">Resolved</span>
                    </div>
                    <div class="alert-desc">${report.description}</div>
                    <div class="alert-meta">
                        <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            ${report.userName}
                        </span>
                        <span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            Resolved ${formatTimestamp(report.updatedAt)}
                        </span>
                    </div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewReportDetails('${report.id}')">View</button>
                </div>
            `;
            historyList.appendChild(historyItem);
        });

        // Render Pagination Controls
        renderPagination(totalPages);

    } catch (error) {
        console.error('Error loading history:', error);
        showToast('Error loading history', 'error');
    }
}

function renderPagination(totalPages) {
    const container = document.getElementById('historyPagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <div class="pagination">
            <button class="page-btn ${currentHistoryPage === 1 ? 'disabled' : ''}" 
                onclick="${currentHistoryPage === 1 ? '' : `loadHistory(${currentHistoryPage - 1})`}"
                ${currentHistoryPage === 1 ? 'disabled' : ''}>
                &laquo; Prev
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        // Show all pages if totalPages is small, otherwise implement ellipsis logic if needed
        // For now, simple numbering
        html += `
            <button class="page-btn ${i === currentHistoryPage ? 'active' : ''}" 
                onclick="loadHistory(${i})">${i}</button>
        `;
    }

    html += `
            <button class="page-btn ${currentHistoryPage === totalPages ? 'disabled' : ''}" 
                onclick="${currentHistoryPage === totalPages ? '' : `loadHistory(${currentHistoryPage + 1})`}"
                ${currentHistoryPage === totalPages ? 'disabled' : ''}>
                Next &raquo;
            </button>
        </div>
        <div class="pagination-info">Page ${currentHistoryPage} of ${totalPages}</div>
    `;

    container.innerHTML = html;
}

// Load Analytics
async function loadAnalytics() {
    try {
        const range = document.querySelector('#analyticsTimeFilter .filter-tab.active')?.dataset.range || 'all';

        // Fetch all relevant reports once, then filter client-side for better UX
        // You could also optimize this with indexed Firestore queries if data is massive
        const reportsSnapshot = await db.collection('emergencyReports')
            .where('type', 'in', [adminDepartment, 'other'])
            .get();

        const allReports = [];
        reportsSnapshot.forEach(doc => allReports.push({ id: doc.id, ...doc.data() }));

        // Filter by Time Range
        const now = new Date();
        const filteredReports = allReports.filter(report => {
            if (!report.createdAt) return false;
            const reportDate = report.createdAt.toDate();

            if (range === 'today') {
                return reportDate.toDateString() === now.toDateString();
            } else if (range === 'week') {
                const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                return reportDate >= weekAgo;
            } else if (range === 'month') {
                const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                return reportDate >= monthAgo;
            }
            return true; // all
        });

        updateAnalyticsStats(filteredReports);
        updateAnalyticsCharts(filteredReports);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Error loading analytics', 'error');
    }
}

function updateAnalyticsStats(reports) {
    let totalResponse = 0;
    let responseCount = 0;
    let resolvedCount = 0;

    reports.forEach(report => {
        if (report.status === 'resolved') {
            resolvedCount++;
            if (report.createdAt && report.updatedAt) {
                const created = report.createdAt.toDate();
                const updated = report.updatedAt.toDate();
                totalResponse += (updated - created) / (1000 * 60);
                responseCount++;
            }
        }
    });

    document.getElementById('totalReportsCount').textContent = reports.length;
    document.getElementById('successRateVal').textContent = reports.length > 0 ? Math.round((resolvedCount / reports.length) * 100) + '%' : '0%';
    document.getElementById('avgResponseTimeVal').textContent = responseCount > 0 ? Math.round(totalResponse / responseCount) + 'm' : '--';
}

function updateAnalyticsCharts(reports) {
    // 1. Distribution Chart Data
    const distribution = {};
    reports.forEach(r => {
        const label = EMERGENCY_TYPES[r.type]?.label || 'Other';
        distribution[label] = (distribution[label] || 0) + 1;
    });

    // 2. Trends Chart Data (Last 7 days or points if 'all')
    const sorted = [...reports].sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());
    const trends = {};
    sorted.forEach(r => {
        const date = r.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        trends[date] = (trends[date] || 0) + 1;
    });

    // --- Render Distribution ---
    if (distributionChart) distributionChart.destroy();
    const distCtx = document.getElementById('distributionChart')?.getContext('2d');
    if (distCtx) {
        distributionChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(distribution),
                datasets: [{
                    data: Object.values(distribution),
                    backgroundColor: ['#DC2626', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, padding: 20 } }
                },
                cutout: '70%'
            }
        });
    }

    // --- Render Trends ---
    if (trendsChart) trendsChart.destroy();
    const trendsCtx = document.getElementById('trendsChart')?.getContext('2d');
    if (trendsCtx) {
        trendsChart = new Chart(trendsCtx, {
            type: 'line',
            data: {
                labels: Object.keys(trends),
                datasets: [{
                    label: 'Reports',
                    data: Object.values(trends),
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#DC2626',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false }, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// Live Map Logic
function initAdminMap() {
    if (adminMap) {
        // Small delay to ensure the container is fully visible before invalidating size
        setTimeout(() => adminMap.invalidateSize(), 100);
        return;
    }

    // Initialize Map (Centering on Pantukan area)
    adminMap = L.map('adminLiveMap').setView([7.1264, 125.8893], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(adminMap);

    // Start listening for all active reports (pending & responding)
    startMapListener();
}

function startMapListener() {
    if (mapListener) mapListener(); // Unsubscribe if exists

    mapListener = db.collection('emergencyReports')
        .where('type', 'in', [adminDepartment, 'other'])
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const report = change.doc.data();
                const id = change.doc.id;

                if (change.type === 'removed' || report.status === 'resolved' || report.status === 'cancelled') {
                    // Explicitly remove markers for non-active reports
                    if (mapMarkers[id]) {
                        adminMap.removeLayer(mapMarkers[id]);
                        delete mapMarkers[id];
                    }
                } else if (report.status === 'pending' || report.status === 'responding') {
                    // Add or Update markers for active reports
                    updateMapMarker(id, report);
                }
            });
        }, (error) => {
            console.error('Map listener error:', error);
        });
}

function updateMapMarker(id, report) {
    if (!report.location) return;

    // Support both 'lat/lng' (resident app) and 'latitude/longitude' (GeoPoint)
    const lat = report.location.lat !== undefined ? report.location.lat : report.location.latitude;
    const lng = report.location.lng !== undefined ? report.location.lng : report.location.longitude;

    if (lat === undefined || lng === undefined) return;

    const emergency = EMERGENCY_TYPES[report.type] || { icon: '🚨', label: 'Other Emergency' };
    const statusColor = report.status === 'pending' ? '#F59E0B' : '#3B82F6';

    // Create marker content
    const popupContent = `
        <div style="min-width: 180px; font-family: var(--font-family); padding: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 800; color: ${statusColor}; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.8px; background: ${statusColor}15; padding: 2px 8px; border-radius: 10px;">
                    ${report.status}
                </span>
                <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">${formatTimestamp(report.createdAt)}</span>
            </div>
            <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 6px; color: var(--color-text-primary); display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.4rem;">${emergency.icon}</span> ${emergency.label}
            </div>
            <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 12px; line-height: 1.5; font-weight: 500;">
                "${report.description}"
            </div>
            <div style="background: var(--color-bg-tertiary); padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--color-text-primary); display: flex; align-items: center; gap: 6px;">
                    <svg style="width:14px; height:14px; opacity: 0.7;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    ${report.userName}
                </div>
                <div style="font-size: 0.8rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 6px; font-weight: 600;">
                    <svg style="width:14px; height:14px; opacity: 0.7;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    ${report.userPhone}
                </div>
            </div>
        </div>
    `;

    const iconHtml = `
        <div class="marker-container ${report.status}">
            <div class="marker-pin" style="background-color: ${statusColor};"></div>
            ${report.status === 'pending' ? '<div class="marker-pulse" style="background-color: ' + statusColor + ';"></div>' : ''}
        </div>
    `;

    const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-div-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    });

    if (mapMarkers[id]) {
        // Update existing marker
        mapMarkers[id].setLatLng([lat, lng]);
        mapMarkers[id].setIcon(customIcon);
        mapMarkers[id].getPopup().setContent(popupContent);
    } else {
        // Create new marker
        const marker = L.marker([lat, lng], { icon: customIcon })
            .addTo(adminMap)
            .bindPopup(popupContent, {
                className: 'custom-map-popup',
                closeButton: false
            });

        mapMarkers[id] = marker;
    }
}

// Realtime Listener
let initialLoad = true; // Use a flag to prevent on-load alert sounds
function startRealtimeListener() {
    if (reportsListener) {
        reportsListener();
    }

    reportsListener = db.collection('emergencyReports')
        .where('type', 'in', [adminDepartment, 'other'])
        .where('status', '==', 'pending')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // If it's literally a newly added report and not the initial connection populating our local data cache
                if (change.type === 'added' && !initialLoad) {
                    const reportData = change.doc.data();
                    const emergency = EMERGENCY_TYPES[reportData.type];
                    showToast(`🚨 NEW EMERGENCY: ${emergency.label} reported by ${reportData.userName}!`, 'error');

                    // Play emergency alert sound
                    try {
                        if (isAudioEnabled) {
                            alertSound.currentTime = 0; // Restart if already playing
                            alertSound.play().catch(err => {
                                console.log("Audio playback blocked by browser or failed:", err);
                            });
                        } else {
                            console.log("Audio not yet unlocked by user interaction.");
                        }
                    } catch (err) {
                        console.log("Audio not supported.");
                    }

                }
            });

            initialLoad = false; // Initial batch of logs is finished
            loadDashboard(); // Refresh the counts and lists
        }, (error) => {
            console.error('Realtime listener error:', error);
        });
}

// Helper: Hard Refresh (Clear Cache & Reload)
async function performHardRefresh(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const originalContent = btn.innerHTML;
    btn.disabled = true;

    // Check if it's the icon-only refresh button or a standard button
    const icon = btn.querySelector('svg');
    if (btn.classList.contains('btn-icon') && icon) {
        icon.classList.add('spin');
    } else {
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> Updating...';
    }

    try {
        showToast('Clearing cache and updating...', 'info');

        // 1. Clear Service Worker Caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }

        // 2. Unregister Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) {
                await reg.unregister();
            }
        }

        // 3. Clear Local Storage (Keeping Auth & Theme)
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

        showToast('Updating data...', 'success');

        setTimeout(() => {
            window.location.reload(true);
        }, 800);

    } catch (error) {
        console.error("Refresh failed:", error);
        btn.disabled = false;
        const icon = btn.querySelector('svg');
        if (icon) icon.classList.remove('spin');
        btn.innerHTML = originalContent;
        showToast('Update failed. Try manually refreshing.', 'error');
    }
}

// Refresh Dashboard
document.getElementById('refreshDashboard').addEventListener('click', () => performHardRefresh('refreshDashboard'));


// Force Update (Settings Modal)
document.getElementById('forceUpdateBtn')?.addEventListener('click', () => {
    performHardRefresh('forceUpdateBtn');
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

/**
 * Report Generation & Export Logic
 */

// Toggle Custom Range Visibility
document.getElementById('exportPeriod')?.addEventListener('change', (e) => {
    const customRange = document.getElementById('exportCustomRange');
    if (customRange) {
        customRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    }
});

// Main Export Handler
document.getElementById('btnGenerateReport')?.addEventListener('click', async () => {
    const period = document.getElementById('exportPeriod').value;
    const format = document.getElementById('exportFormat').value;
    const btn = document.getElementById('btnGenerateReport');

    // 1. Determine Date Range
    let startDate, endDate;
    const now = new Date();

    if (period === 'weekly') {
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        endDate = now;
    } else if (period === 'monthly') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        endDate = now;
    } else {
        const startVal = document.getElementById('exportStartDate').value;
        const endVal = document.getElementById('exportEndDate').value;
        if (!startVal || !endVal) {
            showToast('Please select both start and end dates', 'warning');
            return;
        }
        startDate = new Date(startVal);
        endDate = new Date(endVal);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            showToast('Invalid date selection', 'error');
            return;
        }
        endDate.setHours(23, 59, 59);
    }

    // Validation: Start before end
    if (startDate > endDate) {
        showToast('Start date must be before end date', 'warning');
        return;
    }

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Processing...';

    try {
        // 2. Fetch Data (Client-side filtering to avoid complex index requirements)
        const snapshot = await db.collection('emergencyReports')
            .where('type', 'in', [adminDepartment, 'other'])
            .get();

        const data = [];
        snapshot.forEach(doc => {
            const docData = doc.data();
            if (docData.createdAt) {
                const reportDate = docData.createdAt.toDate();
                if (reportDate >= startDate && reportDate <= endDate) {
                    data.push({ id: doc.id, ...docData });
                }
            }
        });

        // Sort by date descending
        data.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        if (data.length === 0) {
            showToast('No reports found for the selected range', 'info');
            btn.innerHTML = originalContent;
            btn.disabled = false;
            return;
        }

        // 3. Format & Download
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `iAlert_Report_${period}_${timestamp}`;

        if (format === 'pdf') {
            await generatePDF(data, filename, startDate, endDate);
        } else {
            await generateWord(data, filename, startDate, endDate);
        }

        showToast('Report generated successfully', 'success');
    } catch (error) {
        console.error('Export Error:', error);
        showToast('Failed to generate report', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
});

async function generatePDF(reports, filename, start, end) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header Styling
    doc.setFillColor(220, 38, 38); // Header Color
    doc.rect(0, 0, 210, 40, 'F');

    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('iAlert Pantukan', 14, 20);

    doc.setFontSize(14);
    doc.text('Emergency System - Admin Report', 14, 30);

    // Report Info
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Department: ${EMERGENCY_TYPES[adminDepartment]?.label || 'General'}`, 14, 50);
    doc.text(`Period: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`, 14, 56);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 62);
    doc.text(`Total Records: ${reports.length}`, 14, 68);

    // Summary Section
    const resolvedCount = reports.filter(r => r.status === 'resolved').length;
    const rate = Math.round((resolvedCount / reports.length) * 100);

    doc.autoTable({
        startY: 75,
        head: [['Statistical Summary', 'Value']],
        body: [
            ['Total Emergency Reports', reports.length.toString()],
            ['Successfully Resolved', resolvedCount.toString()],
            ['Resolution Rate', rate + '%'],
            ['Ongoing/Pending', (reports.length - resolvedCount).toString()]
        ],
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38], textColor: 255 }
    });

    // Main Data Table
    const tableData = reports.map(r => [
        r.createdAt?.toDate().toLocaleString() || 'N/A',
        EMERGENCY_TYPES[r.type]?.label || r.type,
        r.address || 'N/A',
        (r.status || 'pending').toUpperCase(),
        r.description || 'No description provided'
    ]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['Date/Time', 'Category', 'Barangay', 'Status', 'Description']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 30 },
            3: { cellWidth: 25 },
            4: { cellWidth: 'auto' }
        }
    });

    doc.save(`${filename}.pdf`);
}

async function generateWord(reports, filename, start, end) {
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const rate = Math.round((resolved / reports.length) * 100);

    let tableRows = '';
    reports.forEach(r => {
        tableRows += `
            <tr>
                <td style="border: 1px solid #000; padding: 5px;">${r.createdAt?.toDate().toLocaleString() || 'N/A'}</td>
                <td style="border: 1px solid #000; padding: 5px;">${EMERGENCY_TYPES[r.type]?.label || r.type}</td>
                <td style="border: 1px solid #000; padding: 5px;">${r.address || 'N/A'}</td>
                <td style="border: 1px solid #000; padding: 5px;">${(r.status || 'pending').toUpperCase()}</td>
                <td style="border: 1px solid #000; padding: 5px;">${r.description || ''}</td>
            </tr>
        `;
    });

    const content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><style>
            body { font-family: 'Segoe UI', Arial, sans-serif; }
            .header { background-color: #DC2626; color: white; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #0F172A; color: white; border: 1px solid #000; padding: 8px; text-align: left; }
        </style></head>
        <body>
            <div class="header">
                <h1>iAlert Pantukan</h1>
                <p>Emergency System - Admin Report</p>
            </div>
            
            <div style="padding: 20px;">
                <p><b>Department:</b> ${EMERGENCY_TYPES[adminDepartment]?.label || 'General'}</p>
                <p><b>Period:</b> ${start.toLocaleDateString()} to ${end.toLocaleDateString()}</p>
                <p><b>Generated on:</b> ${new Date().toLocaleString()}</p>
                
                <h2>Summary Statistics</h2>
                <ul>
                    <li>Total Reports: ${reports.length}</li>
                    <li>Resolved: ${resolved}</li>
                    <li>Resolution Rate: ${rate}%</li>
                </ul>
                
                <h2>Detailed Report Records</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date/Time</th>
                            <th>Category</th>
                            <th>Barangay</th>
                            <th>Status</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', content], {
        type: 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
