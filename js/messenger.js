/**
 * iAlert Messenger Logic (Firestore Version)
 * Handles real-time chat between Residents and Admins/Residents using Firestore onSnapshot.
 */

// Use globally defined currentUser if available, otherwise initialize it.
if (typeof currentUser === 'undefined') {
    window.currentUser = null;
}
let currentChatRoom = null;
let currentChatPartnerId = null;
let chatUnsubscribe = null;
let partnerUnsubscribe = null;
let inboxUnsubscribe = null;
let typingTimeout = null;
let inboxCache = []; // Global cache for real-time search
let lastSearchQuery = '';

const DEFAULT_AVATAR = (name) => `https://ui-avatars.com/api/?background=EBEDEF&color=475569&bold=true&name=${encodeURIComponent(name || 'User')}`;

// ── Presence Management (Keep RTDB if available, otherwise fallback) ────────
// Note: Realtime Presence is significantly better in RTDB. 
// If the user insists on Firestore, it's less 'real-time' for presence, 
// but we'll try to use a simple 'lastActive' field.

function initPresence(userId) {
    if (!userId) return;
    // We update 'lastActive' every minute
    function updateActive() {
        db.collection('USERS').doc(userId).update({
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {
            db.collection('ADMIN').doc(userId).update({
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        });
    }
    updateActive();
    setInterval(updateActive, 60000); // Pulse every minute
}

// ── Inbox & Conversations ───────────────────

function initInbox(userId) {
    if (!db || !userId) return;

    if (inboxUnsubscribe) inboxUnsubscribe();

    // ── Setup Real-time Search Listener (Initial) ──
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput && !searchInput.dataset.listenerSet) {
        searchInput.dataset.listenerSet = 'true';
        searchInput.addEventListener('input', (e) => {
            lastSearchQuery = e.target.value.toLowerCase().trim();
            filterAndRenderInbox();
        });
    }

    inboxUnsubscribe = db.collection('CHATS')
        .where('participants', 'array-contains', userId)
        .orderBy('lastTimestamp', 'desc')
        .onSnapshot((snapshot) => {
            const conversationList = document.getElementById('conversationList');
            if (!conversationList) return;

            if (snapshot.empty) {
                conversationList.innerHTML = `
                    <div class="chat-empty-state">
                        <div class="empty-icon">💬</div>
                        <p>No messages yet</p>
                        <span>Start a conversation with a responder or other residents.</span>
                    </div>`;
                return;
            }

            const conversations = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Find the other participant's info
                const otherId = data.participants.find(id => id !== userId);
                const info = data.participantInfo ? data.participantInfo[otherId] : {};
                
                conversations.push({ 
                    id: doc.id, 
                    otherUserId: otherId,
                    otherUserName: info.name || 'User',
                    otherUserAvatar: info.photoURL || DEFAULT_AVATAR(info.name),
                    lastMessage: data.lastMessage,
                    lastTimestamp: data.lastTimestamp?.toMillis() || Date.now(),
                    unread: data.unreadCount ? data.unreadCount[userId] > 0 : false
                });
            });

            inboxCache = conversations; // Update cache
            filterAndRenderInbox(); // Initial render + Filtered updates
        }, (error) => {
            console.error("Inbox listener error:", error);
        });
}

function filterAndRenderInbox() {
    if (!lastSearchQuery) {
        renderInbox(inboxCache);
        return;
    }
    const filtered = inboxCache.filter(chat => 
        chat.otherUserName.toLowerCase().includes(lastSearchQuery) || 
        (chat.lastMessage && chat.lastMessage.toLowerCase().includes(lastSearchQuery))
    );
    renderInbox(filtered);
}

function renderInbox(conversations) {
    const list = document.getElementById('conversationList');
    if (!list) return;
    list.innerHTML = '';

    conversations.forEach(chat => {
        const card = document.createElement('div');
        const isUnread = chat.unread === true;
        card.className = `chat-card ${isUnread ? 'unread' : ''}`;
        card.onclick = () => openChat(chat.otherUserId, chat.otherUserName, chat.otherUserAvatar);

        const time = formatTimestampShort(chat.lastTimestamp);
        
        card.innerHTML = `
            <div class="chat-avatar-wrap">
                <img src="${chat.otherUserAvatar}" alt="Avatar">
            </div>
            <div class="chat-info">
                <h4>${chat.otherUserName}</h4>
                <div class="chat-snippet-row">
                    <p>${chat.lastMessage || 'Sent an attachment'}</p>
                    <span class="time-divider">• ${time}</span>
                </div>
            </div>
            ${isUnread ? '<div class="unread-dot-fixed"></div>' : ''}`;
        list.appendChild(card);
    });
}

// ── Chat Window Logic ────────────────────────

async function openChat(otherUid, otherName, otherAvatar) {
    if (!currentUser) {
        const uJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || localStorage.getItem('user');
        if (uJson) currentUser = JSON.parse(uJson);
    }
    if (!currentUser) return;
    
    currentChatPartnerId = otherUid;
    const myUid = currentUser.id || currentUser.uid;
    
    // Deterministic Convo ID
    currentChatRoom = [myUid, otherUid].sort().join('_');
    
    // UI Update
    document.getElementById('chatHeaderName').textContent = otherName;
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerAvatar) headerAvatar.src = otherAvatar || DEFAULT_AVATAR(otherName);
    
    // Setup Partner Status Listener
    if (partnerUnsubscribe) partnerUnsubscribe();
    const sub = document.getElementById('chatHeaderSub');
    if (sub) {
        sub.textContent = 'Connecting...';
        sub.style.color = 'var(--color-text-muted)';
        
        partnerUnsubscribe = db.collection('USERS').doc(otherUid).onSnapshot(doc => {
            if (!doc.exists) {
                // Check ADMIN if not in USERS
                db.collection('ADMIN').doc(otherUid).get().then(adminDoc => {
                    if (adminDoc.exists) updateHeaderStatus(adminDoc.data());
                });
                return;
            }
            updateHeaderStatus(doc.data());
        });

        function updateHeaderStatus(data) {
            if (!data || !data.lastActive) {
                sub.textContent = 'Offline';
                sub.style.color = 'var(--color-text-muted)';
                return;
            }
            const lastTs = data.lastActive.toMillis();
            const now = Date.now();
            const diff = (now - lastTs) / 1000;
            if (diff < 120) { // Under 2 mins
                sub.textContent = 'Active now';
                sub.style.color = '#10B981'; // var(--color-success)
            } else {
                sub.textContent = 'Active ' + formatLastSeen(lastTs);
                sub.style.color = 'var(--color-text-muted)';
            }
        }
    }

    document.getElementById('chatModal').classList.add('active');
    
    // Mark as read (reset unreadCount for me)
    const updateObj = {};
    updateObj[`unreadCount.${myUid}`] = 0;
    db.collection('CHATS').doc(currentChatRoom).update(updateObj).catch(() => {});
    
    // Listen for Typing & Presence (Simulated via CHATS doc)
    db.collection('CHATS').doc(currentChatRoom).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        
        // Handle Typing
        const typing = data.typingStatus ? data.typingStatus[otherUid] : false;
        const indicator = document.getElementById('chatTypingIndicator');
        if (indicator) {
            if (typing) {
                // Personalize the typing text with their name
                const typingName = otherName.toUpperCase();
                let textEl = indicator.querySelector('.typing-text');
                if (!textEl) {
                    textEl = document.createElement('span');
                    textEl.className = 'typing-text';
                    textEl.style.fontSize = '0.75rem';
                    textEl.style.fontWeight = '700';
                    textEl.style.color = '#64748B';
                    textEl.style.marginLeft = '8px';
                    textEl.style.textTransform = 'uppercase';
                    indicator.appendChild(textEl);
                }
                textEl.textContent = `${typingName} is typing...`;
                indicator.style.display = 'flex';
                indicator.style.alignItems = 'center';
            } else {
                indicator.style.display = 'none';
            }
        }
        if (typing) scrollChatToBottom();

        // ── AUTO MARK AS READ (if modal is active) ──
        if (document.getElementById('chatModal').classList.contains('active')) {
            const currentUid = currentUser.id || currentUser.uid;
            if (data.unreadCount && data.unreadCount[currentUid] > 0) {
                console.log("[Messenger] Modal active, auto-clearing unread count.");
                db.collection('CHATS').doc(currentChatRoom).update({
                    [`unreadCount.${currentUid}`]: 0
                }).catch(() => {});
            }
        }
    });

    // Load Messages
    loadMessagesFirestore(currentChatRoom);
}

function loadMessagesFirestore(roomId) {
    const chatContainer = document.getElementById('chatMessages');
    chatContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--color-text-muted); font-size: 0.8rem;">Secure, encryption enabled.</div>';
    
    if (chatUnsubscribe) chatUnsubscribe();

    chatUnsubscribe = db.collection('CHATS').doc(roomId).collection('MESSAGES')
        .orderBy('timestamp', 'asc')
        .limitToLast(50)
        .onSnapshot((snapshot) => {
            // Optimistic rendering: check for only new changes
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    renderMessage(change.doc.data());
                }
            });
            scrollChatToBottom();
        });
}

function renderMessage(msg) {
    const container = document.getElementById('chatMessages');
    const myUid = currentUser.id || currentUser.uid;
    const isMine = msg.senderId === myUid;

    const div = document.createElement('div');
    div.className = `message-group ${isMine ? 'outgoing' : 'incoming'}`;
    
    const ts = msg.timestamp?.toMillis() || Date.now();
    const displayTime = formatTimeOnly(ts);

    div.innerHTML = `
        <div class="message-bubble ${isMine ? 'outgoing' : 'incoming'}">
            ${msg.text}
        </div>
        <div class="message-meta">${displayTime}</div>
    `;
    
    container.appendChild(div);
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatRoom || !currentUser) return;

    const myUid = currentUser.id || currentUser.uid;
    const myName = currentUser.name;
    const myAvatar = currentUser.photoURL || DEFAULT_AVATAR(myName);

    const msgData = {
        senderId: myUid,
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    input.value = '';
    input.style.height = 'auto';

    try {
        // 1. Add Message to Subcollection
        await db.collection('CHATS').doc(currentChatRoom).collection('MESSAGES').add(msgData);

        // 2. Update parent CHATS doc (Inbox)
        const chatUpdate = {
            lastMessage: text,
            lastTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
            participants: [myUid, currentChatPartnerId],
            participantInfo: {
                [myUid]: { name: myName, photoURL: myAvatar },
                [currentChatPartnerId]: { 
                    name: document.getElementById('chatHeaderName').textContent,
                    photoURL: document.getElementById('chatHeaderAvatar')?.src || ''
                }
            }
        };

        // Increment unread for partner
        chatUpdate[`unreadCount.${currentChatPartnerId}`] = firebase.firestore.FieldValue.increment(1);

        await db.collection('CHATS').doc(currentChatRoom).set(chatUpdate, { merge: true });

        stopTyping();
    } catch (e) {
        console.error("Error sending message:", e);
        showToast("Message failed to send", "error");
    }
}

// ── Typing Logic ───────────────────────────

function startTyping() {
    if (!currentChatRoom || !currentUser) return;
    const myUid = currentUser.id || currentUser.uid;
    
    const updateObj = {};
    updateObj[`typingStatus.${myUid}`] = true;
    db.collection('CHATS').doc(currentChatRoom).update(updateObj).catch(() => {});
    
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
}

function stopTyping() {
    if (!currentChatRoom || !currentUser) return;
    const myUid = currentUser.id || currentUser.uid;
    const updateObj = {};
    updateObj[`typingStatus.${myUid}`] = false;
    db.collection('CHATS').doc(currentChatRoom).update(updateObj).catch(() => {});
}

// ── Search Logic (Same as before, using USERS/ADMIN collections) ──

async function searchUsers(query) {
    const resultsContainer = document.getElementById('userSearchResults');
    if (!query || query.length < 2) {
        resultsContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--color-text-muted);">Type at least 2 characters...</p>';
        return;
    }

    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center;"><div class="spinner"></div></div>';

    try {
        let nameQuery = query.charAt(0).toUpperCase() + query.slice(1);
        let lowerQuery = query.toLowerCase();
        
        // Firestore queries are case-sensitive, so we try to match capitalized names
        const residentsQuery = db.collection('USERS').where('name', '>=', nameQuery).where('name', '<=', nameQuery + '\uf8ff').limit(10).get();
        const adminsQuery = db.collection('ADMIN').where('name', '>=', nameQuery).where('name', '<=', nameQuery + '\uf8ff').limit(5).get();

        // Also try lowercase search in case names are stored that way (fallback)
        const residentsLower = db.collection('USERS').where('name', '>=', lowerQuery).where('name', '<=', lowerQuery + '\uf8ff').limit(5).get();

        const [residents, admins, residents2] = await Promise.all([residentsQuery, adminsQuery, residentsLower]);
        
        const seenIds = new Set();
        let html = '';
        const myUid = currentUser?.id || currentUser?.uid;

        const processResults = (snap, role) => {
            snap.forEach(doc => {
                if (doc.id === myUid || seenIds.has(doc.id)) return;
                seenIds.add(doc.id);
                const u = doc.data();
                html += renderSearchItem(doc.id, u.name, u.photoURL, role || u.department || 'User');
            });
        };

        processResults(admins, 'Administrator');
        processResults(residents, 'Resident');
        processResults(residents2, 'Resident');

        resultsContainer.innerHTML = html || '<p style="padding: 20px; text-align: center;">No users found.</p>';
    } catch (e) {
        resultsContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--color-error);">Search failed.</p>';
    }
}

function renderSearchItem(uid, name, avatar, role) {
    const safeName = (name || 'Unknown').replace(/'/g, "\\'");
    const safeAvatar = (avatar || '').replace(/'/g, "\\'");
    return `
        <div class="search-user-item" onclick="startChatFromSearch('${uid}', '${safeName}', '${safeAvatar}')">
            <img src="${avatar || 'assets/logo/pantukan.jpg'}" alt="Avatar">
            <div class="info">
                <h5>${name}</h5>
                <p>${role}</p>
            </div>
        </div>
    `;
}

function startChatFromSearch(uid, name, avatar) {
    document.getElementById('searchUserModal').classList.remove('active');
    openChat(uid, name, avatar);
}

// ── Helpers ─────────────────────────────────

function scrollChatToBottom() {
    const area = document.getElementById('chatMessages');
    if (area) area.scrollTop = area.scrollHeight;
}

function formatLastSeen(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTimestampShort(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTimeOnly(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── DOM Initialization ──────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Navigation / Toggle logic
    const chatBtn = document.getElementById('navBtnChat');
    const tabMessages = document.getElementById('tabMessages');
    const closeMessengerBtn = document.getElementById('closeMessengerBtn');

    if (chatBtn && tabMessages) {
        chatBtn.addEventListener('click', () => {
            // Only toggle explicitly if NOT handled by global tab system (detected via data-tab)
            if (!chatBtn.hasAttribute('data-tab')) {
                tabMessages.classList.toggle('active');
            }
            const dot = document.getElementById('navChatDot') || document.getElementById('navBtnChatDot');
            if (dot) dot.style.display = 'none';
        });
    }

    if (closeMessengerBtn && tabMessages) {
        closeMessengerBtn.addEventListener('click', () => {
            tabMessages.classList.remove('active');
        });
    }
    
    // Core Messenger Init
    let retryCount = 0;
    const initInterval = setInterval(() => {
        const uJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || localStorage.getItem('user');
        if (uJson) {
            currentUser = JSON.parse(uJson);
            const uid = currentUser.id || currentUser.uid;
            if (uid) {
                initPresence(uid);
                initInbox(uid);
                clearInterval(initInterval);
                console.log("[Messenger] Initialized with Firestore for:", uid);
            }
        }
        retryCount++;
        if (retryCount > 15) clearInterval(initInterval);
    }, 1000);

    // Modal Close
    document.getElementById('closeChatBtn')?.addEventListener('click', () => {
        document.getElementById('chatModal').classList.remove('active');
        if (chatUnsubscribe) chatUnsubscribe();
    });

    // Start New Chat Event
    document.getElementById('startNewChatBtn')?.addEventListener('click', () => {
        document.getElementById('searchUserModal').classList.add('active');
    });
    document.getElementById('closeSearchBtn')?.addEventListener('click', () => {
        document.getElementById('searchUserModal').classList.remove('active');
    });

    // Search Input Logic
    let searchDebounce = null;
    document.getElementById('userSearchInput')?.addEventListener('input', (e) => {
        const val = e.target.value;
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => searchUsers(val), 400);
    });

    // Action Logic
    document.getElementById('sendChatBtn')?.addEventListener('click', sendMessage);
    document.getElementById('chatInput')?.addEventListener('input', (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';
        startTyping();
    });
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});
