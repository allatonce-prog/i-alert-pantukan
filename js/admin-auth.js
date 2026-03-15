// Admin Authentication

const adminRegisterForm = document.getElementById('adminRegisterForm');

// Check if user is already logged in
function checkAuth() {
    const userJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (userJson) {
        const user = JSON.parse(userJson);
        if (user.role === 'super-admin') {
            window.location.href = 'super-admin.html';
        } else if (user.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'resident.html';
        }
    }
}

// Only run checkAuth on auth pages
if (document.querySelector('.auth-container')) {
    checkAuth();
}

// Update "Back to Login" link if Super Admin is logged in
window.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (userJson) {
        const user = JSON.parse(userJson);
        const backLink = document.querySelector('.auth-footer a');
        if (user.role === 'super-admin' && backLink) {
            backLink.textContent = '← Back to Dashboard';
            backLink.href = 'super-admin.html';
        }
    }
});

// ── Success Animation Transition ────────────────
function triggerSuccessTransition(targetUrl) {
    const overlay = document.getElementById('pageTransition');
    const container = document.getElementById('transitionContainer');
    const success = document.getElementById('loginSuccessContent');

    if (overlay && success) {
        if (container) container.style.display = 'none';
        success.style.display = 'block';
        overlay.classList.add('active');

        setTimeout(() => {
            window.location.href = targetUrl;
        }, 1800);
    } else {
        window.location.href = targetUrl;
    }
}

// Admin Registration Handler
if (adminRegisterForm) {
    adminRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('adminName').value;
        const email = document.getElementById('adminEmail').value.trim();
        const phone = document.getElementById('adminPhone').value;
        const department = document.getElementById('adminDepartment').value;
        const station = document.getElementById('adminStation').value;
        const password = document.getElementById('adminPassword').value.trim();
        const token = document.getElementById('adminToken').value.trim();
        const submitBtn = adminRegisterForm.querySelector('button[type="submit"]');

        // 1. Validate Token
        if (token !== DEPARTMENT_CODES[department]) {
            showToast('Invalid Department Access Token', 'error');
            return;
        }

        // 2. Validate password length
        if (password.length < 6) {
            showToast('Password must be at least 6 characters long', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Registering Sys-Account...</span>';

        try {
            // Check if email already exists in ADMIN collection
            const userCheck = await db.collection('ADMIN').where('email', '==', email).get();
            if (!userCheck.empty) {
                throw new Error('This email is already registered as an admin.');
            }

            // 1. Create Native Auth Account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const authUser = userCredential.user;

            const adminData = {
                id: authUser.uid,
                name: name,
                email: email,
                phone: phone,
                department: department,
                station: station,
                role: 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // 2. Save Profile in Firestore (UID as Document ID)
            await db.collection('ADMIN').doc(authUser.uid).set(adminData);

            // Register Logic Refresh
            const currentUserJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
            const currentUser = currentUserJson ? JSON.parse(currentUserJson) : {};
            const isSuperAdmin = currentUser.role === 'super-admin';

            if (!isSuperAdmin) {
                // Auto-login locally only if NOT registered by Super Admin
                localStorage.setItem('currentUser', JSON.stringify(adminData));
            }

            showToast('Admin account created successfully!', 'success');

            const target = isSuperAdmin ? 'super-admin.html' : 'admin.html';
            triggerSuccessTransition(target);

        } catch (error) {
            console.error('Admin registration error:', error);
            showToast(error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Register Department Admin</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}
