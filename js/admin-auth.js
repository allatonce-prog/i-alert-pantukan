// Admin Authentication

const adminRegisterForm = document.getElementById('adminRegisterForm');

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

// Only run checkAuth on auth pages
if (document.querySelector('.auth-container')) {
    checkAuth();
}

// Admin Registration Handler
if (adminRegisterForm) {
    adminRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('adminName').value;
        const email = document.getElementById('adminEmail').value;
        const phone = document.getElementById('adminPhone').value;
        const department = document.getElementById('adminDepartment').value;
        const station = document.getElementById('adminStation').value;
        const password = document.getElementById('adminPassword').value;
        const submitBtn = adminRegisterForm.querySelector('button[type="submit"]');

        // Validate password length
        if (password.length < 6) {
            showToast('Password must be at least 6 characters long', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> <span>Registering...</span>';

        try {
            // Check if email already exists in ADMIN
            const userCheck = await db.collection('ADMIN').where('email', '==', email).get();
            if (!userCheck.empty) {
                throw new Error('Email already registered');
            }

            const adminData = {
                name: name,
                email: email,
                phone: phone,
                department: department,
                station: station,
                password: password, // Storing plain text password as requested
                role: 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // Add to ADMIN collection
            const docRef = await db.collection('ADMIN').add(adminData);

            // Add ID to local object
            adminData.id = docRef.id;

            // Auto-login
            localStorage.setItem('currentUser', JSON.stringify(adminData));

            showToast('Admin account created successfully!', 'success');

            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 1000);

        } catch (error) {
            console.error('Admin registration error:', error);
            showToast(error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Register Department Admin</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
        }
    });
}
