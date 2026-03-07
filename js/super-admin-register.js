// Super Admin Registration Logic - iAlert Pantukan

const superRegisterForm = document.getElementById('superRegisterForm');
const MASTER_AUTHORIZATION_CODE = 'SUPER2026'; // System Master Key

// Check if user is already logged in
function checkAuth() {
    const userJson = localStorage.getItem('currentUser');
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

if (superRegisterForm) {
    superRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const masterCode = document.getElementById('masterCode').value.trim();
        const name = document.getElementById('superName').value;
        const email = document.getElementById('superEmail').value.trim();
        const password = document.getElementById('superPassword').value.trim();
        const submitBtn = superRegisterForm.querySelector('button[type="submit"]');

        // 1. Validate Master Code
        if (masterCode !== MASTER_AUTHORIZATION_CODE) {
            showToast('Invalid Master Authorization Code', 'error');
            return;
        }

        // 2. Validate Password
        if (password.length < 8) {
            showToast('Password must be at least 8 characters for Super Admin', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Initializing Master Account...</span>';

        try {
            // 3. Create Native Auth Account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const authUser = userCredential.user;

            const superData = {
                id: authUser.uid,
                name: name,
                email: email,
                role: 'super-admin',
                department: 'system',
                station: 'Central Hub',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // 4. Save Profile in Firestore (UID as Document ID in ADMIN collection)
            await db.collection('ADMIN').doc(authUser.uid).set(superData);

            // 5. Auto-login locally
            localStorage.setItem('currentUser', JSON.stringify(superData));

            showToast('Super Admin initialized successfully!', 'success');

            setTimeout(() => {
                window.location.href = 'super-admin.html';
            }, 1000);

        } catch (error) {
            console.error('Super Admin registration error:', error);
            let msg = error.message;
            if (error.code === 'auth/email-already-in-use') msg = 'Email address is already in use by another account.';
            showToast(msg, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Initialize Super Admin</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}
