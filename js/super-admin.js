// Super Master Hub Logic - iAlert Pantukan

const directoryBody = document.getElementById('directoryBody');
const accSearchInput = document.getElementById('accSearch');
const tableTabs = document.querySelectorAll('.table-tab');
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebarToggle');
const navItems = document.querySelectorAll('.nav-item[data-target]');
const logoutTriggers = [document.getElementById('logoutBtnTrigger'), document.getElementById('headerLogout')];

// Creation Form
const provisionForm = document.getElementById('provisionForm');

// Modal Elements
const confirmModal = document.getElementById('confirmModal');
const modalYes = document.getElementById('modalYes');
const modalNo = document.getElementById('modalNo');

let systemAccounts = [];
let tableFilter = 'all';
let deleteQueue = null;

// 🛡️ 1. Global Security & Session
function masterVerify() {
    const userJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (!userJson) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(userJson);
    if (user.role !== 'super-admin') {
        window.location.href = user.role === 'admin' ? 'admin.html' : 'resident.html';
    } else {
        document.getElementById('saNameDisplay').textContent = user.name || 'Master Admin';
    }
}

// 📦 2. Data Sync Engine
async function syncSystem() {
    try {
        const usersSnap = await db.collection('USERS').get();
        const adminSnap = await db.collection('ADMIN').get();

        const users = usersSnap.docs.map(doc => ({ id: doc.id, collection: 'USERS', ...doc.data() }));
        const admins = adminSnap.docs.map(doc => ({ id: doc.id, collection: 'ADMIN', ...doc.data() }));

        systemAccounts = [...users, ...admins].filter(acc => acc.role !== 'super-admin');

        document.getElementById('adminCount').textContent = admins.filter(a => a.role === 'admin').length;
        document.getElementById('userCount').textContent = users.length;

        refreshTable();
    } catch (error) {
        console.error('Master Sync Error:', error);
        showToast('System database sync failed', 'error');
    }
}

// 🖼️ 3. Hub Hub Table Rendering
function refreshTable() {
    const query = accSearchInput.value.toLowerCase();

    const filtered = systemAccounts.filter(acc => {
        const matchesQuery = (acc.name && acc.name.toLowerCase().includes(query)) ||
            (acc.email && acc.email.toLowerCase().includes(query));
        const matchesFilter = tableFilter === 'all' || acc.role === tableFilter;
        return matchesQuery && matchesFilter;
    });

    directoryBody.innerHTML = filtered.map(acc => `
        <tr>
            <td class="profile-cell">
                <div class="avatar-box">${(acc.name || 'U').charAt(0).toUpperCase()}</div>
                <div>
                    <div style="font-weight: 800; color: #0F172A; font-size: 0.95rem;">${acc.name || 'Unnamed'}</div>
                    <div style="font-size: 0.7rem; color: #94A3B8; font-family: monospace; letter-spacing: 0.5px;">UID: ${acc.id.substring(0, 12)}...</div>
                </div>
            </td>
            <td>
                <span class="role-badge role-${acc.role}">${acc.role}</span>
            </td>
            <td>
                <div style="color: #64748B; font-size: 0.85rem; font-weight: 600;">${acc.email}</div>
                <div style="font-size: 0.75rem; color: #CBD5E1;">${acc.phone || 'No Contact Number'}</div>
            </td>
            <td style="color: #94A3B8; font-size: 0.8rem; font-weight: 500;">
                ${acc.createdAt ? new Date(acc.createdAt.seconds * 1000).toLocaleDateString() : 'Historical'}
            </td>
            <td style="text-align: right;">
                <button class="btn-terminal" onclick="hubDeleteRequest('${acc.id}', '${acc.collection}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete</span>
                </button>
            </td>
        </tr>
    `).join('');

    if (filtered.length === 0) {
        directoryBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 100px 0; color: #94A3B8; font-weight: 600;">No accounts found.</td></tr>`;
    }
}

// 🧭 4. Nav Logic (Sidebar & Tabs)
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Sidebar Desktop Toggle
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    document.getElementById('toggleIcon').style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
});

// Mobile Sidebar Open
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        sidebarOverlay.classList.add('active');
    });
}

// Mobile Sidebar Close
if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
    });
}

navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-target');

        // Update Nav UI
        navItems.forEach(i => i.classList.remove('active'));
        btn.classList.add('active');

        // Update Tab Visibility
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(targetTabId).classList.add('active');

        // Update Title Header
        const titles = {
            'dashboardTab': 'Dashboard',
            'usersTab': 'Users',
            'creationTab': 'Create Account',
            'maintenanceTab': 'Maintenance'
        };
        document.getElementById('viewTitle').textContent = titles[targetTabId] || 'Master Hub';

        // Auto-close on mobile
        if (window.innerWidth <= 1024) {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        }
    });
});

// 🛠️ 5. Maintenance / Purge Logic
window.purgeSystem = async (collectionName) => {
    const confirmMsg = `WARNING: This will permanently delete ALL data in the ${collectionName} collection. This action is IRREVERSIBLE. Are you ABSOLUTELY sure?`;

    if (confirm(confirmMsg)) {
        showToast(`Preparing to purge ${collectionName}...`, 'warning');

        try {
            const snapshot = await db.collection(collectionName).get();
            const total = snapshot.size;

            if (total === 0) {
                showToast(`The ${collectionName} collection is already empty.`, 'info');
                return;
            }

            let deletedCount = 0;
            const batch = db.batch();

            snapshot.docs.forEach(doc => {
                // Safeguard: Never delete the Super Admin's own record from ADMIN collection
                const data = doc.data();
                if (collectionName === 'ADMIN' && data.role === 'super-admin') {
                    console.log("Protecting Super Admin record:", doc.id);
                    return;
                }

                batch.delete(doc.ref);
                deletedCount++;
            });

            await batch.commit();
            showToast(`Successfully purged ${deletedCount} records from ${collectionName}`, 'success');
            syncSystem(); // Refresh stats

        } catch (error) {
            console.error(`Purge Error (${collectionName}):`, error);
            showToast(`System Purge failed: ${error.message}`, 'error');
        }
    }
};

// 📋 6. Account Creation (provisionForm)
if (provisionForm) {
    provisionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('pName').value;
        const email = document.getElementById('pEmail').value;
        const phone = document.getElementById('pPhone').value;
        const department = document.getElementById('pDept').value;
        const station = document.getElementById('pStation').value;
        const password = document.getElementById('pPass').value;
        const submitBtn = provisionForm.querySelector('button[type="submit"]');

        if (password.length < 8) {
            showToast('Security policy requires 8+ characters for admins', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Granting Authorization...</span>';

        try {
            const authSnap = await db.collection('ADMIN').where('email', '==', email).get();
            if (!authSnap.empty) throw new Error('Email is already provisioned in system');

            // 🛠️ SESSION FIX: Create a temporary secondary app to create the user
            // This prevents the Super Admin from being signed out
            const tempAppName = "TempCreationApp_" + Date.now();
            const tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
            const tempAuth = tempApp.auth();

            const credential = await tempAuth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;

            const adminData = {
                id: user.uid, name, email, phone, department, station,
                role: 'admin', status: 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('ADMIN').doc(user.uid).set(adminData);

            // Cleanup secondary app
            await tempApp.delete();

            showToast(`Access granted to ${name}`, 'success');
            provisionForm.reset();
            syncSystem();

        } catch (error) {
            console.error('Provisioning Error:', error);
            showToast(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>';
        }
    });
}

// 🗑️ 6. Termination Flow
window.hubDeleteRequest = (id, col) => {
    deleteQueue = { id, collection: col };
    confirmModal.style.display = 'flex';
};

modalYes.addEventListener('click', async () => {
    if (!deleteQueue) return;
    modalYes.disabled = true;
    modalYes.textContent = 'Purging...';

    try {
        await db.collection(deleteQueue.collection).doc(deleteQueue.id).delete();
        showToast('Authorization revoked successfully', 'success');
        systemAccounts = systemAccounts.filter(acc => acc.id !== deleteQueue.id);
        refreshTable();
    } catch (err) {
        showToast('Purge operation failed', 'error');
    } finally {
        confirmModal.style.display = 'none';
        modalYes.disabled = false;
        modalYes.textContent = 'Delete';
        deleteQueue = null;
    }
});

modalNo.addEventListener('click', () => {
    confirmModal.style.display = 'none';
    deleteQueue = null;
});

// 🔍 7. Dashboard Interactivity
accSearchInput.addEventListener('input', refreshTable);
tableTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tableTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tableFilter = tab.getAttribute('data-filter');
        refreshTable();
    });
});

logoutTriggers.forEach(btn => {
    if (btn) btn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });
});

// 🚀 Hub Initialization
masterVerify();
syncSystem();
