// Authentication Logic

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Toggle helpers
function hideAllForms() {
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.remove('active');
    const forgotForm = document.getElementById('forgotForm');
    const successState = document.getElementById('successState');
    if (forgotForm) forgotForm.classList.remove('active');
    if (successState) {
        successState.classList.remove('active');
        successState.style.display = 'none';
    }
}

function showLogin() {
    hideAllForms();
    if (loginForm) loginForm.classList.add('active');
}

function showRegister() {
    hideAllForms();
    if (registerForm) registerForm.classList.add('active');
}

function showForgot() {
    hideAllForms();
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) forgotForm.classList.add('active');
}

function showSuccess() {
    hideAllForms();
    const successState = document.getElementById('successState');
    if (successState) {
        successState.style.display = 'flex';
        successState.classList.add('active');
    }
}

// ── Navigation Listeners ─────────────────────
const goToRegisterBtn = document.getElementById('goToRegisterBtn');
if (goToRegisterBtn) {
    goToRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
}

const goToLoginBtn = document.getElementById('goToLoginBtn');
if (goToLoginBtn) {
    goToLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
}

const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showForgot(); });
}

const backToLoginBtn = document.getElementById('backToLoginBtn');
if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
}

// ── Forgot Password Logic ────────────────────
const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const resetBtn = document.getElementById('resetBtn');
        const originalBtnContent = resetBtn.innerHTML;

        // 1. Cooldown Check (60 seconds)
        const lastReset = localStorage.getItem(`lastReset_${email}`);
        if (lastReset) {
            const secondsPassed = (Date.now() - parseInt(lastReset)) / 1000;
            if (secondsPassed < 60) {
                const wait = Math.ceil(60 - secondsPassed);
                showToast(`Please wait ${wait}s before requesting again.`, 'warning');
                return;
            }
        }

        const panel = forgotForm.closest('.white-panel');
        if (panel) panel.classList.add('scan-active');

        resetBtn.disabled = true;
        resetBtn.innerHTML = '<div class="spinner"></div> <span>Processing...</span>';

        try {
            // 2. Smart Validation: Check if email exists in Firestore
            let userExists = false;

            // Check USERS
            const userCheck = await db.collection('USERS').where('email', '==', email).get();
            if (!userCheck.empty) userExists = true;

            if (!userExists) {
                // Check ADMIN
                const adminCheck = await db.collection('ADMIN').where('email', '==', email).get();
                if (!adminCheck.empty) userExists = true;
            }

            if (!userExists) {
                throw new Error('This email is not registered in our system.');
            }

            // 3. Firebase Native Reset
            await auth.sendPasswordResetEmail(email);

            // 4. Success State & Feedback
            localStorage.setItem(`lastReset_${email}`, Date.now().toString());
            showSuccess();
            showToast('Reset email sent!', 'success');

        } catch (error) {
            console.error('Reset error:', error);
            showToast(error.message || 'Failed to send reset email', 'error');
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalBtnContent;
            if (panel) panel.classList.remove('scan-active');
        }
    });
}

// Check if user is already logged in
function checkAuth() {
    // Check both Local and Session storage
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

// Only run checkAuth on login/register pages
if (document.querySelector('.auth-container')) {
    checkAuth();

    // Pre-fill Remembered Email
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail && document.getElementById('loginEmail')) {
        document.getElementById('loginEmail').value = rememberedEmail;
        const rememberCheckbox = document.getElementById('rememberMe');
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }
}

// Login Handler
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const rememberMe = document.getElementById('rememberMe')?.checked;

        const panel = loginForm.closest('.white-panel');
        if (panel) panel.classList.add('scan-active');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Signing in...</span>';

        try {
            // 0. Set Persistence
            const persistence = rememberMe
                ? firebase.auth.Auth.Persistence.LOCAL
                : firebase.auth.Auth.Persistence.SESSION;
            await auth.setPersistence(persistence);

            // 1. Native Firebase Login
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const authUser = userCredential.user;

            // 2. FETCH PROFILE (Smart Scan by Email)
            // We search by email instead of just Doc ID to support accounts with random IDs
            let userData = null;

            // Search USERS
            const userQuery = await db.collection('USERS').where('email', '==', email).limit(1).get();
            if (!userQuery.empty) {
                const doc = userQuery.docs[0];
                userData = { id: doc.id, ...doc.data() };
            } else {
                // Search ADMIN
                const adminQuery = await db.collection('ADMIN').where('email', '==', email).limit(1).get();
                if (!adminQuery.empty) {
                    const doc = adminQuery.docs[0];
                    userData = { id: doc.id, ...doc.data() };
                }
            }

            if (userData) {
                // Save to storage (LocalStorage for Remember Me, otherwise SessionStorage)
                if (rememberMe) {
                    localStorage.setItem('currentUser', JSON.stringify(userData));
                    localStorage.setItem('rememberedEmail', email);
                } else {
                    sessionStorage.setItem('currentUser', JSON.stringify(userData));
                    localStorage.removeItem('rememberedEmail');
                    localStorage.removeItem('currentUser'); // Clear any old persistent session
                }

                showToast('Logon successful!', 'success');

                setTimeout(() => {
                    const role = userData.role;
                    if (role === 'super-admin') {
                        window.location.href = 'super-admin.html';
                    } else if (role === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'resident.html';
                    }
                }, 1000);
            } else {
                // profile missing in DB
                throw new Error('Authenticated, but system profile not found.');
            }

        } catch (error) {
            console.error('Login error:', error);
            let msg = 'Invalid email or password';

            if (error.code === 'auth/too-many-requests') {
                msg = 'Account temporarily blocked due to many attempts. Try again in a few minutes.';
            } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                msg = 'Incorrect email or password.';
            }

            showToast(msg, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
            if (panel) panel.classList.remove('scan-active');
        }
    });
}

// Register Handler (Residents)
if (registerForm) {
    // Dynamic Address UI
    const regBarangay = document.getElementById('registerAddress');
    const streetGroup = document.getElementById('streetAddressGroup');
    if (regBarangay && streetGroup) {
        regBarangay.addEventListener('change', () => {
            if (regBarangay.value) {
                streetGroup.style.display = 'block';
            } else {
                streetGroup.style.display = 'none';
            }
        });
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value.trim();
        const phone = document.getElementById('registerPhone').value;
        const barangay = document.getElementById('registerAddress').value;
        const street = document.getElementById('registerStreet')?.value.trim();
        const fullAddress = street ? `${street}, ${barangay}` : barangay;
        const password = document.getElementById('registerPassword').value.trim();
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        if (password.length < 6) {
            showToast('Password should be at least 6 characters', 'error');
            return;
        }

        const panel = registerForm.closest('.white-panel');
        if (panel) panel.classList.add('scan-active');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Creating account...</span>';

        try {
            // 1. Create Native Auth Account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const authUser = userCredential.user;

            const userData = {
                id: authUser.uid,
                name: name,
                email: email,
                phone: phone,
                address: fullAddress,
                role: 'resident',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // 2. Save Profile in Firestore (UID as Document ID)
            await db.collection('USERS').doc(authUser.uid).set(userData);

            // Auto-login locally
            localStorage.setItem('currentUser', JSON.stringify(userData));

            showToast('Account created successfully!', 'success');

            setTimeout(() => {
                window.location.href = 'resident.html';
            }, 1000);

        } catch (error) {
            console.error('Registration error:', error);
            let msg = error.message;
            if (error.code === 'auth/email-already-in-use') msg = 'Email is already being used.';
            showToast(msg, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
            if (panel) panel.classList.remove('scan-active');
        }
    });
}
