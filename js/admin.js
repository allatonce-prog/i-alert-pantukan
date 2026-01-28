// Admin Dashboard Logic

let currentAdmin = null;
let adminDepartment = null;
let reportsListener = null;

// Check authentication
async function checkAuth() {
    const userJson = localStorage.getItem('currentUser');
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
            document.getElementById('departmentName').textContent = deptInfo ? deptInfo.label : 'Admin Panel';

            // Load dashboard
            loadDashboard();
            startRealtimeListener();
        } else {
            // User document doesn't exist (deleted?)
            localStorage.removeItem('currentUser');
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

// Logout Handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    try {
        if (reportsListener) {
            reportsListener();
        }
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
});

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
        }
    });
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
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get reports for this department
        const allReports = await db.collection('emergencyReports')
            .where('type', '==', adminDepartment)
            .get();

        const todayReports = [];
        const monthReports = [];
        let pendingCount = 0;
        let respondingCount = 0;
        let resolvedTodayCount = 0;

        allReports.forEach(doc => {
            const report = doc.data();
            const reportDate = report.createdAt ? report.createdAt.toDate() : new Date();

            if (reportDate >= todayStart) {
                todayReports.push({ id: doc.id, ...report });
            }

            if (reportDate >= monthStart) {
                monthReports.push({ id: doc.id, ...report });
            }

            if (report.status === 'pending') pendingCount++;
            if (report.status === 'responding') respondingCount++;
            if (report.status === 'resolved' && reportDate >= todayStart) resolvedTodayCount++;
        });

        // Update stats
        document.getElementById('statPending').textContent = pendingCount;
        document.getElementById('statResponding').textContent = respondingCount;
        document.getElementById('statResolved').textContent = resolvedTodayCount;
        document.getElementById('statTotal').textContent = monthReports.length;
        document.getElementById('pendingBadge').textContent = pendingCount;

        // Load recent alerts
        loadRecentAlerts(todayReports.slice(0, 5));

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

// Load Recent Alerts
function loadRecentAlerts(reports) {
    const alertsList = document.getElementById('recentAlertsList');

    if (!reports || reports.length === 0) {
        alertsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No recent alerts</p>';
        return;
    }

    alertsList.innerHTML = '';

    reports.forEach(report => {
        const emergency = EMERGENCY_TYPES[report.type];

        const alertItem = document.createElement('div');
        alertItem.className = 'alert-item';
        alertItem.innerHTML = `
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

        alertsList.appendChild(alertItem);
    });
}

// Load Reports Page
async function loadReports(statusFilter = 'all') {
    try {
        let query = db.collection('emergencyReports')
            .where('type', '==', adminDepartment);
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
            reportCard.className = 'alert-item';
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

// Status Filter
document.getElementById('statusFilter').addEventListener('change', (e) => {
    loadReports(e.target.value);
});

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
                
                <div style="display: flex; gap: var(--spacing-md);">
                    ${report.status === 'pending' ? `
                        <button class="btn btn-primary" onclick="updateReportStatus('${reportId}', 'responding')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                            Start Response
                        </button>
                    ` : ''}
                    ${report.status === 'responding' ? `
                        <button class="btn btn-success" onclick="updateReportStatus('${reportId}', 'resolved')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            Mark as Resolved
                        </button>
                    ` : ''}
                    <a href="tel:${report.userPhone}" class="btn btn-secondary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        Call Reporter
                    </a>
                    <a href="https://www.google.com/maps?q=${report.location.lat},${report.location.lng}" target="_blank" class="btn btn-secondary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                        </svg>
                        Open in Google Maps
                    </a>
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

// Update Report Status
window.updateReportStatus = async function (reportId, newStatus) {
    try {
        await db.collection('emergencyReports').doc(reportId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`Report marked as ${STATUS_LABELS[newStatus]}`, 'success');

        // Close modal and refresh
        document.getElementById('reportModal').classList.remove('active');
        loadDashboard();

    } catch (error) {
        console.error('Error updating report status:', error);
        showToast('Error updating report status', 'error');
    }
};

// Close Report Modal
document.getElementById('closeReportModal').addEventListener('click', () => {
    document.getElementById('reportModal').classList.remove('active');
});

// Load History
async function loadHistory() {
    try {
        const historySnapshot = await db.collection('emergencyReports')
            .where('type', '==', adminDepartment)
            .where('status', '==', 'resolved')
            .get();

        // Client-side sort and limit
        let history = [];
        historySnapshot.forEach(doc => {
            history.push({ id: doc.id, ...doc.data() });
        });

        // Sort by updatedAt desc
        history.sort((a, b) => {
            const dateA = a.updatedAt ? a.updatedAt.toDate() : new Date(0);
            const dateB = b.updatedAt ? b.updatedAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        // Limit to 50
        history = history.slice(0, 50);

        const historyList = document.getElementById('historyList');

        if (history.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">No history yet</p>';
            return;
        }

        historyList.innerHTML = '';

        history.forEach(report => {
            const emergency = EMERGENCY_TYPES[report.type];

            const historyItem = document.createElement('div');
            historyItem.className = 'alert-item';
            historyItem.innerHTML = `
                <div class="alert-icon ${report.type}">${emergency.icon}</div>
                <div class="alert-content">
                    <div class="alert-header">
                        <span class="alert-type">${emergency.label}</span>
                        <span class="alert-status resolved">Resolved</span>
                    </div>
                    <div class="alert-desc">${report.description}</div>
                    <div class="alert-meta">
                        <span>${report.userName}</span>
                        <span>Resolved ${formatTimestamp(report.updatedAt)}</span>
                    </div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewReportDetails('${report.id}')">View</button>
                </div>
            `;

            historyList.appendChild(historyItem);
        });

    } catch (error) {
        console.error('Error loading history:', error);
        showToast('Error loading history', 'error');
    }
}

// Load Analytics
async function loadAnalytics() {
    try {
        const reportsSnapshot = await db.collection('emergencyReports')
            .where('type', '==', adminDepartment)
            .get();

        let totalResponse = 0;
        let responseCount = 0;
        let successCount = 0;
        let totalCount = 0;

        reportsSnapshot.forEach(doc => {
            const report = doc.data();
            totalCount++;

            if (report.status === 'resolved') {
                successCount++;

                if (report.createdAt && report.updatedAt) {
                    const created = report.createdAt.toDate();
                    const updated = report.updatedAt.toDate();
                    const responseTime = (updated - created) / (1000 * 60); // minutes
                    totalResponse += responseTime;
                    responseCount++;
                }
            }
        });

        const avgResponseTime = responseCount > 0 ? Math.round(totalResponse / responseCount) : 0;
        const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

        document.getElementById('avgResponseTime').textContent = avgResponseTime;
        document.getElementById('successRate').textContent = successRate + '%';

        const deptInfo = EMERGENCY_TYPES[adminDepartment];
        document.getElementById('commonEmergency').textContent = deptInfo ? deptInfo.label : 'N/A';

    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Error loading analytics', 'error');
    }
}

// Realtime Listener
function startRealtimeListener() {
    if (reportsListener) {
        reportsListener();
    }

    reportsListener = db.collection('emergencyReports')
        .where('type', '==', adminDepartment)
        .where('status', '==', 'pending')
        .onSnapshot(() => {
            loadDashboard();
        }, (error) => {
            console.error('Realtime listener error:', error);
        });
}

// Refresh Dashboard
document.getElementById('refreshDashboard').addEventListener('click', loadDashboard);
document.getElementById('viewAllReports').addEventListener('click', () => {
    document.querySelector('[data-page="reports"]').click();
});
