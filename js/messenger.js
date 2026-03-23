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
let currentGroupData = null; // Store current group info

// ── Group Chat State ──
let isGroupMode = false;
let selectedMembers = []; // Array of {id, name, photoURL}

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
                const isGroup = data.isGroup || false;
                
                let otherUserId = null;
                let otherUserName = 'Unknown User';
                let otherUserAvatar = '';

                if (isGroup) {
                    otherUserName = data.groupName || 'Group Chat';
                    otherUserAvatar = ''; // Group default handled by DEFAULT_AVATAR or logic
                } else {
                    otherUserId = data.participants.find(id => id !== userId);
                    const info = data.participantInfo ? data.participantInfo[otherUserId] : null;
                    if (info) {
                        otherUserName = info.name;
                        otherUserAvatar = info.photoURL;
                    }
                }

                conversations.push({ 
                    id: doc.id, 
                    otherUserId,
                    otherUserName,
                    otherUserAvatar,
                    isGroup,
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
        card.onclick = () => openChat(chat.otherUserId || chat.id, chat.otherUserName, chat.otherUserAvatar, chat.isGroup);

        const time = formatTimestampShort(chat.lastTimestamp);
        
        card.innerHTML = `
            <div class="chat-avatar-wrap">
                <img src="${chat.otherUserAvatar || DEFAULT_AVATAR(chat.otherUserName)}" alt="Avatar">
                ${chat.isGroup ? '<div class="group-icon-badge">👥</div>' : ''}
            </div>
            <div class="chat-info">
                <div class="chat-info-header">
                    <h4 class="chat-user-name">${chat.otherUserName}</h4>
                    <span class="time-divider">${time}</span>
                </div>
                <div class="chat-snippet-row">
                    <p>${chat.lastMessage || 'Sent an attachment'}</p>
                </div>
            </div>
            ${isUnread ? '<div class="unread-dot-fixed"></div>' : ''}`;
        list.appendChild(card);
    });
}

// ── Chat Window Logic ────────────────────────

async function openChat(otherUidOrGroupId, name, avatar, isGroup = false) {
    if (!currentUser) {
        const uJson = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || localStorage.getItem('user');
        if (uJson) currentUser = JSON.parse(uJson);
    }
    if (!currentUser) return;
    
    const myUid = currentUser.id || currentUser.uid;

    if (isGroup) {
        currentChatRoom = otherUidOrGroupId;
        currentChatPartnerId = null;
    } else {
        currentChatPartnerId = otherUidOrGroupId;
        currentChatRoom = [myUid, otherUidOrGroupId].sort().join('_');
    }
    
    // UI Update
    document.getElementById('chatHeaderName').textContent = name;
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerAvatar) headerAvatar.src = avatar || DEFAULT_AVATAR(name);
    
    // Setup Header Dept/Status
    const deptEl = document.getElementById('chatHeaderDept');
    if (deptEl) deptEl.style.display = 'none';

    if (partnerUnsubscribe) partnerUnsubscribe();
    const sub = document.getElementById('chatHeaderSub');
    if (sub) {
        sub.textContent = isGroup ? 'Group Chat' : 'Connecting...';
        sub.style.color = 'var(--color-text-muted)';
        
        if (!isGroup) {
            partnerUnsubscribe = db.collection('USERS').doc(otherUidOrGroupId).onSnapshot(doc => {
                if (!doc.exists) {
                    db.collection('ADMIN').doc(otherUidOrGroupId).get().then(adminDoc => {
                        if (adminDoc.exists) updateHeaderStatus(adminDoc.data());
                    });
                    return;
                }
                updateHeaderStatus(doc.data());
            });
        } else {
            // Group specific headers
            sub.textContent = 'Active conversation room';
            sub.style.color = 'var(--color-text-muted)';
            
            // Fetch and store group member info
            db.collection('CHATS').doc(otherUidOrGroupId).get().then(doc => {
                if (doc.exists) currentGroupData = doc.data();
            });
        }

        // Show/Hide Info Button
        const infoBtn = document.getElementById('groupInfoBtn');
        if (infoBtn) infoBtn.style.display = isGroup ? 'flex' : 'none';

        function updateHeaderStatus(data) {
            // ... [Activity Status Logic] ...
            if (!data || !data.lastActive) {
                sub.textContent = 'Offline';
                sub.style.color = 'var(--color-text-muted)';
            } else {
                const lastTs = data.lastActive.toMillis();
                const now = Date.now();
                const diff = (now - lastTs) / 1000;
                if (diff < 120) {
                    sub.textContent = 'Active now';
                    sub.style.color = '#10B981';
                } else {
                    sub.textContent = 'Active ' + formatLastSeen(lastTs);
                    sub.style.color = 'var(--color-text-muted)';
                }
            }

            // Update Department Badge
            if (deptEl && data && data.department) {
                const deptInfo = EMERGENCY_TYPES[data.department];
                deptEl.textContent = (deptInfo ? deptInfo.label : data.department).toUpperCase();
                deptEl.style.display = 'inline-block';
                if (deptInfo && deptInfo.color) {
                    deptEl.style.background = `${deptInfo.color}18`;
                    deptEl.style.color = deptInfo.color;
                }
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
        let typing = false;
        let tName = '';

        if (!isGroup) {
            typing = data.typingStatus ? data.typingStatus[otherUidOrGroupId] : false;
            tName = name;
        } else {
            if (data.typingStatus) {
                const typingUid = Object.keys(data.typingStatus).find(uid => uid !== myUid && data.typingStatus[uid] === true);
                if (typingUid) {
                    typing = true;
                    const info = data.participantInfo ? data.participantInfo[typingUid] : null;
                    tName = info ? info.name : 'Someone';
                }
            }
        }

        const indicator = document.getElementById('chatTypingIndicator');
        if (indicator) {
            if (typing) {
                // Personalize the typing text with their name
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
                textEl.textContent = `${tName} IS TYPING...`;
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
    chatContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--color-text-muted); font-size: 0.8rem;">Start Conversation</div>';
    
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

    let content = '';
    if (msg.imageUrl) {
        content += `<img src="${msg.imageUrl}" class="chat-image-msg" onclick="window.openFullscreenImage('${msg.imageUrl}')">`;
    }
    if (msg.text) {
        content += `<div>${msg.text}</div>`;
    }

    let bubbleClass = `message-bubble ${isMine ? 'outgoing' : 'incoming'}`;
    if (msg.imageUrl && !msg.text) {
        bubbleClass += ' image-only';
    }

    div.innerHTML = `
        <div class="${bubbleClass}">
            ${content}
        </div>
        <div class="message-meta">${displayTime}</div>
    `;
    
    container.appendChild(div);
}

let selectedChatFile = null;

function clearChatImagePreview() {
    selectedChatFile = null;
    const previewArea = document.getElementById('chatImagePreviewArea');
    if (previewArea) previewArea.style.display = 'none';
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input ? input.value.trim() : '';
    
    // Check if we have an image to upload from preview
    let finalImageUrl = null;
    
    if (!text && !selectedChatFile) return;
    if (!currentChatRoom || !currentUser) return;

    const myUid = currentUser.id || currentUser.uid;
    const myName = currentUser.name;
    const myAvatar = currentUser.photoURL || DEFAULT_AVATAR(myName);

    const sendBtn = document.getElementById('sendChatBtn');
    const originalBtn = sendBtn ? sendBtn.innerHTML : '';
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<div class="spinner-sm" style="width:14px;height:14px;border-width:2px;"></div>';
    }

    try {
        // 1. If image selected, upload it FIRST
        if (selectedChatFile) {
            showToast("Sending photo...", "info");
            finalImageUrl = await uploadChatImage(selectedChatFile);
            clearChatImagePreview();
        }

        const msgData = {
            senderId: myUid,
            text: text,
            imageUrl: finalImageUrl,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }

        // 2. Add Message to Subcollection
        await db.collection('CHATS').doc(currentChatRoom).collection('MESSAGES').add(msgData);

        // 3. Update parent CHATS doc (Inbox)
        const chatUpdate = {
            lastMessage: finalImageUrl ? '📷 Photo' : text,
            lastTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (currentChatPartnerId) {
            // 1-1 Chat: Update specific participant info
            chatUpdate.participants = [myUid, currentChatPartnerId];
            chatUpdate.participantInfo = {
                [myUid]: { name: myName, photoURL: myAvatar },
                [currentChatPartnerId]: { 
                    name: document.getElementById('chatHeaderName').textContent,
                    photoURL: document.getElementById('chatHeaderAvatar')?.src || ''
                }
            };
            chatUpdate[`unreadCount.${currentChatPartnerId}`] = firebase.firestore.FieldValue.increment(1);
        } else {
            // Group Chat: Update only unread count for everyone ELSE
            // Since we don't know the full member list in the UI, 
            // the backend/full snapshot would usually handle this.
            // But for simple Firestore client-side:
            const chatSnap = await db.collection('CHATS').doc(currentChatRoom).get();
            if (chatSnap.exists) {
                const data = chatSnap.data();
                data.participants.forEach(pid => {
                    if (pid !== myUid) {
                        chatUpdate[`unreadCount.${pid}`] = firebase.firestore.FieldValue.increment(1);
                    }
                });
            }
        }

        await db.collection('CHATS').doc(currentChatRoom).set(chatUpdate, { merge: true });

        stopTyping();
    } catch (e) {
        console.error("Error sending message:", e);
        showToast("Message failed to send", "error");
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalBtn;
        }
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
    const isSelected = selectedMembers.some(m => m.id === uid);
    
    return `
        <div class="search-user-item ${isGroupMode ? 'group-mode' : ''} ${isSelected ? 'selected' : ''}" 
             data-id="${uid}" 
             onclick="selectMember('${uid}', '${safeName}', '${safeAvatar}')">
            <img src="${avatar || DEFAULT_AVATAR(name)}" alt="Avatar">
            <div class="info">
                <h5>${name}</h5>
                <p>${role}</p>
            </div>
            ${isGroupMode ? '<div class="selection-indicator"></div>' : ''}
        </div>
    `;
}

// ── Group Chat Interaction Logic ──

function toggleGroupMode() {
    isGroupMode = !isGroupMode;
    const btn = document.getElementById('startGroupBtn');
    const bar = document.getElementById('selectedMembersBar');
    const nextBtn = document.getElementById('groupNextBtn');
    
    if (isGroupMode) {
        btn.style.background = '#DC2626';
        btn.style.color = 'white';
        if (bar) bar.style.display = 'flex';
        selectedMembers = [];
        updateSelectionBar();
        showToast("Select members for group", "info");
    } else {
        btn.style.background = 'rgba(220, 38, 38, 0.1)';
        btn.style.color = '#DC2626';
        if (bar) bar.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    }
    
    // Refresh results to show/hide checkboxes
    const query = document.getElementById('userSearchInput')?.value;
    if (query) searchUsers(query);
}

function selectMember(id, name, avatar) {
    if (!isGroupMode) {
        startChatFromSearch(id, name, avatar);
        return;
    }

    const idx = selectedMembers.findIndex(m => m.id === id);
    if (idx > -1) {
        selectedMembers.splice(idx, 1);
    } else {
        // Fallback for avatar in selection
        const safeAvatar = avatar && avatar !== 'null' && avatar !== 'undefined' ? avatar : DEFAULT_AVATAR(name);
        selectedMembers.push({ id, name, photoURL: safeAvatar });
    }
    
    updateSelectionBar();
    
    // Refresh UI state for indicators
    const items = document.querySelectorAll(`.search-user-item[data-id="${id}"]`);
    items.forEach(it => it.classList.toggle('selected'));
}

function updateSelectionBar() {
    const bar = document.getElementById('selectedMembersBar');
    const nextBtn = document.getElementById('groupNextBtn');
    if (!bar) return;

    if (selectedMembers.length > 0) {
        let html = '';
        selectedMembers.forEach(m => {
            html += `
                <div class="selected-member-bubble">
                    <img src="${m.photoURL || DEFAULT_AVATAR(m.name)}" alt="Avatar">
                    <button class="remove-member-small" onclick="selectMember('${m.id}')">&times;</button>
                </div>
            `;
        });
        bar.innerHTML = html;
        if (nextBtn) nextBtn.style.display = 'block';
    } else {
        bar.innerHTML = '<p style="font-size: 0.75rem; color: #64748B; margin: 4px auto;">Select members...</p>';
        if (nextBtn) nextBtn.style.display = 'none';
    }
}

// Exposed to global scope for reliable interaction
window.createGroupChat = async function() {
    console.log("[Messenger] createGroupChat clicked", selectedMembers);
    if (selectedMembers.length < 1) {
        showToast("Select at least 1 member", "warning");
        return;
    }
    const modal = document.getElementById('groupNameModal');
    const previousModal = document.getElementById('searchUserModal');
    if (modal) {
        if (previousModal) previousModal.classList.remove('active');
        modal.classList.add('active');
        const input = document.getElementById('groupNameInput');
        if (input) input.focus();
    } else {
        console.error("groupNameModal not found");
    }
}

window.confirmCreateGroup = async function() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    if (!groupName) {
        showToast("Enter a group name", "warning");
        return;
    }

    if (!currentUser) {
        showToast("Session error, please refresh", "error");
        return;
    }
    const myUid = currentUser.id || currentUser.uid;
    const myName = currentUser.name || currentUser.fullName || (currentUser.firstName ? `${currentUser.firstName} ${currentUser.lastName}` : 'Someone');
    const myAvatar = currentUser.photoURL || DEFAULT_AVATAR(myName);

    const participants = [myUid, ...selectedMembers.map(m => m.id)];
    const participantInfo = {
        [myUid]: { name: myName, photoURL: myAvatar }
    };
    
    selectedMembers.forEach(m => {
        participantInfo[m.id] = { 
            name: m.name || 'Member', 
            photoURL: m.photoURL || DEFAULT_AVATAR(m.name || 'Member') 
        };
    });

    const groupData = {
        isGroup: true,
        groupName: groupName,
        participants: participants,
        participantInfo: participantInfo,
        lastMessage: 'Created a new group chat',
        lastTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
        unreadCount: {}
    };

    participants.forEach(pid => {
        groupData.unreadCount[pid] = (pid === myUid) ? 0 : 1;
    });

    try {
        const btn = document.getElementById('confirmCreateGroupBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div> Creating...';
        }

        const docRef = await db.collection('CHATS').add(groupData);
        
        await docRef.collection('MESSAGES').add({
            senderId: 'system',
            text: `${myName} created the group "${groupName}"`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // UI Reset
        document.getElementById('groupNameModal').classList.remove('active');
        document.getElementById('searchUserModal').classList.remove('active');
        document.getElementById('groupNameInput').value = '';
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Create Group';
        }

        toggleGroupMode(); // Reset isGroupMode and UI
        openChat(docRef.id, groupName, null, true);
        showToast("Group created!", "success");
    } catch (e) {
        console.error("Creation failed:", e);
        showToast("Error creating group: " + e.message, "error");
        const btn = document.getElementById('confirmCreateGroupBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Create Group';
        }
    }
}

// Group Info Logic
window.showGroupInfo = function() {
    if (!currentGroupData) {
        showToast("Loading group info...", "info");
        return;
    }
    const list = document.getElementById('groupMembersList');
    if (!list) return;

    const info = currentGroupData.participantInfo || {};
    list.innerHTML = Object.entries(info).map(([id, user]) => `
        <div class="search-user-item" style="cursor: default; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.03);">
            <div class="user-avatar" style="width: 44px; height: 44px; margin-right: 14px;">
                <img src="${user.photoURL || DEFAULT_AVATAR(user.name)}" alt="Avatar">
            </div>
            <div class="user-info">
                <div class="user-name" style="font-size: 0.95rem; font-weight: 700; color: #1E293B;">
                    ${user.name} ${id === (currentUser.id || currentUser.uid) ? '<span style="color: var(--color-primary); font-size: 0.75rem; margin-left: 4px;">(You)</span>' : ''}
                </div>
                <div class="user-role" style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Member</div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('groupInfoModal').classList.add('active');
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

// ── Cloudinary Image Upload ───────────────────
let CHAT_CLOUDINARY = {
    cloudName: 'djghkklph',
    apiKey: '613592386419746',
    apiSecret: 'CREDENTIAL_STORED_IN_FIRESTORE'
};

db.collection('config').doc('cloudinary').get().then(doc => {
    if (doc.exists) CHAT_CLOUDINARY = doc.data();
});

async function uploadChatImage(file) {
    const { cloudName, apiKey, apiSecret } = CHAT_CLOUDINARY;
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    // Auth Signature
    const paramsToSign = `timestamp=${timestamp}${apiSecret}`;
    const msgBuffer = new TextEncoder().encode(paramsToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Chat image upload error:', error);
        throw error;
    }
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

    document.getElementById('startNewChatBtn')?.addEventListener('click', () => {
        document.getElementById('searchUserModal').classList.add('active');
        if (isGroupMode) toggleGroupMode(); // Reset if previously in group mode
    });
    
    document.getElementById('closeGroupInfoBtn')?.addEventListener('click', () => {
        document.getElementById('groupInfoModal').classList.remove('active');
    });

    document.getElementById('closeSearchBtn')?.addEventListener('click', () => {
        document.getElementById('searchUserModal').classList.remove('active');
        if (isGroupMode) toggleGroupMode(); // Reset
    });

    // Group Chat Events
    document.getElementById('startGroupBtn')?.addEventListener('click', toggleGroupMode);
    // Explicitly using global functions for buttons with onclick
    document.getElementById('closeGroupNameBtn')?.addEventListener('click', () => {
        document.getElementById('groupNameModal').classList.remove('active');
        document.getElementById('searchUserModal')?.classList.add('active'); // RESTORE previous modal
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
    
    // Image Preview Action
    document.getElementById('removeChatImageBtn')?.addEventListener('click', clearChatImagePreview);

    // Image Upload Initialisation
    const attachBtn = document.getElementById('chatAttachBtn');
    if (attachBtn) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.id = 'chatImageInput';
        document.body.appendChild(fileInput);

        attachBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            selectedChatFile = file;
            const reader = new FileReader();
            reader.onload = (re) => {
                const previewArea = document.getElementById('chatImagePreviewArea');
                const previewImg = document.getElementById('chatImagePreview');
                if (previewArea && previewImg) {
                    previewImg.src = re.target.result;
                    previewArea.style.display = 'block';
                    scrollChatToBottom();
                }
            };
            reader.readAsDataURL(file);
            fileInput.value = ''; // Reset input to allow same file again
        });
    }


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
