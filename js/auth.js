// Authentication Logic

// Tab switching
const loginTab = document.querySelector('[data-tab="login"]');
const registerTab = document.querySelector('[data-tab="register"]');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    });

    registerTab.addEventListener('click', () => {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    });
}

// Check if user is already logged in
function checkAuth() {
    const userJson = localStorage.getItem('currentUser');
    if (userJson) {
        const user = JSON.parse(userJson);
        if (user.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'resident.html';
        }
    }
}

// Only run checkAuth on login/register pages
if (document.querySelector('.auth-container')) {
    checkAuth();
}

// Login Handler
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Signing in...</span>';

        try {
            // Check USERS collection first
            let querySnapshot = await db.collection('USERS')
                .where('email', '==', email)
                .where('password', '==', password)
                .get();

            let user = null;
            let collectionType = 'USERS';

            if (!querySnapshot.empty) {
                user = querySnapshot.docs[0].data();
                user.id = querySnapshot.docs[0].id;
            } else {
                // Check ADMIN collection
                querySnapshot = await db.collection('ADMIN')
                    .where('email', '==', email)
                    .where('password', '==', password)
                    .get();

                if (!querySnapshot.empty) {
                    user = querySnapshot.docs[0].data();
                    user.id = querySnapshot.docs[0].id; // Ensure ID is captured
                    collectionType = 'ADMIN';
                }
            }

            if (user) {
                // Save to localStorage
                localStorage.setItem('currentUser', JSON.stringify(user));
                showToast('Login successful!', 'success');

                setTimeout(() => {
                    if (user.role === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'resident.html';
                    }
                }, 1000);
            } else {
                throw new Error('Invalid email or password');
            }

        } catch (error) {
            console.error('Login error:', error);
            showToast(error.message || 'Login failed', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}

// Register Handler (Residents)
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const phone = document.getElementById('registerPhone').value;
        const address = document.getElementById('registerAddress').value;
        const password = document.getElementById('registerPassword').value;
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        if (password.length < 6) {
            showToast('Password must be at least 6 characters long', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Creating account...</span>';

        try {
            // Check if email already exists in USERS
            const userCheck = await db.collection('USERS').where('email', '==', email).get();
            if (!userCheck.empty) {
                throw new Error('Email already registered');
            }

            const userData = {
                name: name,
                email: email,
                phone: phone,
                address: address,
                password: password, // Storing plain text password as requested
                role: 'resident',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // Add to USERS collection
            const docRef = await db.collection('USERS').add(userData);

            // Add ID to local object for storage
            userData.id = docRef.id;

            // Auto-login
            localStorage.setItem('currentUser', JSON.stringify(userData));

            showToast('Account created successfully!', 'success');

            setTimeout(() => {
                window.location.href = 'resident.html';
            }, 1000);

        } catch (error) {
            console.error('Registration error:', error);
            showToast(error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}
