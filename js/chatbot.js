/**
 * iAlert Pantukan - Chatbot Assistant
 * Powered by Groq AI (with Voice Support)
 */

// Fallback key (Replaced by Firestore config)
let CHAT_API_KEY = "";
const CHAT_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"; // New Llama 4 Vision Model

// Centralized Configuration Loader
async function syncGrokConfig() {
    try {
        const doc = await db.collection('config').doc('chatbot').get();
        if (doc.exists) {
            const data = doc.data();
            const key = data.apiKey || data.groqApiKey;
            if (key) {
                CHAT_API_KEY = key.trim();
                console.log("[Chatbot] Vision AI synced");
            }
        }
    } catch (e) { console.error("Config sync failed", e); }
}
syncGrokConfig();

const SYSTEM_PROMPT = `You are the iAlert Pantukan AI Vision Assistant.
You have the ability to see and analyze photos sent by residents.

Your core mission:
1. **Analyze Images**: If an image is provided, identify the type of emergency (Fire, Medical, Road Accident, etc.).
2. **Assess Danger**: Estimate the severity and provide immediate life-saving instructions.
3. **Guide Action**: Always remind the user to click the "SEND ALERT" button to notify real human responders.
4. **Safety Tips**: Provide context-specific advice (e.g., if you see a fire, tell them to stay low and find an exit).

Guidelines:
- If no image is provided, act as a helpful emergency information assistant.
- Keep responses under 150 words.
- Be precise and calm.
- If an image is unclear, ask for a better view while giving general safety advice.`;

const EMERGENCY_ACTIONS = [
    { type: 'fire', label: 'Fire', icon: '🔥' },
    { type: 'police', label: 'Police', icon: '👮' },
    { type: 'medical', label: 'Medical', icon: '🏥' },
    { type: 'rescue', label: 'Rescue', icon: '⛑️' },
    { type: 'traffic', label: 'Accident', icon: '🚦' },
    { type: 'other', label: 'Other', icon: '⚠️' }
];

function initChatbot() {
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close');
    const chatbotWindow = document.getElementById('chatbot-window');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotSend = document.getElementById('chatbot-send');
    const chatbotMic = document.getElementById('chatbot-mic');
    const voiceOverlay = document.getElementById('chatbot-voice-overlay');
    const stopMicBtn = document.getElementById('chatbot-mic-stop');
    const attachmentPreview = document.getElementById('chatbot-attachment-preview');
    const attachmentThumb = document.getElementById('attachment-thumb');
    const removeAttachmentBtn = document.getElementById('remove-attachment');

    let chatHistory = [];
    let isRecording = false;
    let recognition = null;

    // Initialize Speech Recognition (Voice Input)
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isRecording = true;
            if (chatbotMic) chatbotMic.classList.add('recording');
            if (voiceOverlay) voiceOverlay.classList.add('active');
            chatbotInput.placeholder = "Listening...";
        };

        recognition.onend = () => {
            isRecording = false;
            if (chatbotMic) chatbotMic.classList.remove('recording');
            if (voiceOverlay) voiceOverlay.classList.remove('active');
            chatbotInput.placeholder = "Type or talk to me...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatbotInput.value = transcript;
            sendMessage();
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            isRecording = false;
            if (chatbotMic) chatbotMic.classList.remove('recording');
            if (voiceOverlay) voiceOverlay.classList.remove('active');
        };
    }

    // Handle Mic Stop Button
    if (stopMicBtn) {
        stopMicBtn.addEventListener('click', () => {
            if (recognition) recognition.stop();
        });
    }

    // Toggle Chat Window
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            chatbotWindow.classList.toggle('active');
            if (chatbotWindow.classList.contains('active')) {
                chatbotInput.focus();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            chatbotWindow.classList.remove('active');
            if (window.speechSynthesis) window.speechSynthesis.cancel(); // Stop talking on close
        });
    }

    // Handle Mic Button
    if (chatbotMic) {
        chatbotMic.addEventListener('click', () => {
            if (!recognition) {
                showToast("Voice recognition not supported in this browser.", "error");
                return;
            }
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    }

    const chatbotCamera = document.getElementById('chatbot-camera');
    const chatbotUpload = document.getElementById('chatbot-upload');
    const chatbotFileInput = document.getElementById('chatbot-file-input');
    const stopVoiceBtn = document.getElementById('chatbot-stop-voice');
    let pendingImageBase64 = null;

    // Handle Remove Attachment
    if (removeAttachmentBtn) {
        removeAttachmentBtn.addEventListener('click', () => {
            pendingImageBase64 = null;
            if (attachmentPreview) attachmentPreview.style.display = 'none';
        });
    }

    // Handle Voice Stop
    if (stopVoiceBtn) {
        stopVoiceBtn.addEventListener('click', () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
                stopVoiceBtn.style.display = 'none';
            }
        });
    }

    // Handle Local Photo Upload
    if (chatbotUpload && chatbotFileInput) {
        chatbotUpload.addEventListener('click', () => chatbotFileInput.click());
        
        chatbotFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                window.onImageCapturedForChat(base64);
            };
            reader.readAsDataURL(file);
            chatbotFileInput.value = ''; // Reset for same file re-upload
        });
    }

    // Handle Camera Scan
    if (chatbotCamera) {
        chatbotCamera.addEventListener('click', () => {
            if (typeof window.openEmergencyModal === 'function') {
                showToast("Opening camera for AI Photo Scan...", "info");
                
                // Add a special class to hide form elements
                const modal = document.getElementById('emergencyModal');
                if (modal) modal.classList.add('vision-scan-mode');

                window.selectedEmergencyType = 'other';
                window.openEmergencyModal();
                
                // Then click the camera button
                setTimeout(() => {
                    const camBtn = document.getElementById('openCameraBtn');
                    if (camBtn) camBtn.click();
                }, 400);
                
                window.isChatbotScan = true;
                chatbotWindow.classList.remove('active'); 
            } else {
                showToast("Camera access is only available on the resident mobile dashboard.", "warning");
            }
        });
    }

    // Global hook for captured images (set from resident.js)
    window.onImageCapturedForChat = (base64) => {
        pendingImageBase64 = base64;
        
        // Remove the special scan class
        const modal = document.getElementById('emergencyModal');
        if (modal) modal.classList.remove('vision-scan-mode');

        // Close the modal (return to chat)
        if (typeof window.closeModal === 'function') {
            window.closeModal();
        }

        chatbotWindow.classList.add('active');
        
        // Show attachment preview instead of auto-sending
        if (attachmentThumb && attachmentPreview) {
            attachmentThumb.src = base64;
            attachmentPreview.style.display = 'flex';
            chatbotInput.placeholder = "Add a message about this photo...";
            chatbotInput.focus();
        }

        scrollToBottom();
    };

    // Handle Sending Message
    const sendMessage = async () => {
        const message = chatbotInput.value.trim();
        const currentImage = pendingImageBase64;
        
        if (!message && !currentImage) return;

        // Add user message to UI
        if (currentImage) {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'message user image-preview';
            previewDiv.innerHTML = `
                <img src="${currentImage}" style="max-width: 100%; border-radius: 12px;">
                ${message ? `<div class="image-caption" style="padding: 10px; background: rgba(0,0,0,0.05); border-radius: 10px; margin-top: 8px; font-weight: 500; font-size: 0.95rem; color: #1c1c1e;">${message}</div>` : ''}
            `;
            chatbotMessages.appendChild(previewDiv);
            if (attachmentPreview) attachmentPreview.style.display = 'none';
        } else {
            addMessage(message, 'user');
        }

        chatbotInput.value = '';
        chatbotInput.style.height = 'auto';
        chatbotInput.placeholder = "Type or talk...";
        pendingImageBase64 = null; // Clear after use

        // Add to history (Multimodal format)
        if (currentImage) {
            chatHistory.push({
                role: "user",
                content: [
                    { type: "text", text: message || "Look at this image." },
                    { type: "image_url", image_url: { url: currentImage } }
                ]
            });
        } else {
            chatHistory.push({ role: "user", content: message });
        }

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const responseText = await callChatAPI();
            removeTypingIndicator(typingId);
            addMessage(responseText, 'bot');
            chatHistory.push({ role: "assistant", content: responseText });

            // Grok Voice Support
            speakResponse(responseText);

            const emergencyKeywords = ['emergency', 'fire', 'police', 'medical', 'rescue', 'accident', 'help', 'alert', 'danger'];
            const shouldShowAlerts = emergencyKeywords.some(kw =>
                responseText.toLowerCase().includes(kw) ||
                (typeof message === 'string' && message.toLowerCase().includes(kw))
            );

            if (shouldShowAlerts) {
                setTimeout(() => addQuickAlerts(), 500);
            }
        } catch (error) {
            console.error("Chatbot Error:", error);
            removeTypingIndicator(typingId);
            addMessage("Vision Scan Error: " + (error.message || "Connection failed"), 'bot');
        }
    };

    // ... (rest of listeners) ...

    if (chatbotSend) {
        chatbotSend.addEventListener('click', sendMessage);
    }

    if (chatbotInput) {
        chatbotInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        chatbotInput.addEventListener('input', () => {
            chatbotInput.style.height = 'auto';
            chatbotInput.style.height = (chatbotInput.scrollHeight) + 'px';
        });
    }

    // Helper: Add Message to UI
    function addMessage(text, side) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${side}`;
        msgDiv.textContent = text;

        if (side === 'bot') {
            const listenBtn = document.createElement('button');
            listenBtn.className = 'message-listen-btn';
            listenBtn.innerHTML = `📢`;
            listenBtn.onclick = () => speakResponse(text);
            msgDiv.appendChild(listenBtn);
        }

        chatbotMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    // Helper: Speak Response
    function speakResponse(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        if (stopVoiceBtn) stopVoiceBtn.style.display = 'flex';

        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.onend = () => {
            if (stopVoiceBtn) stopVoiceBtn.style.display = 'none';
        };

        utterance.onerror = () => {
            if (stopVoiceBtn) stopVoiceBtn.style.display = 'none';
        };

        const setVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            window.speechSynthesis.speak(utterance);
        };
        if (window.speechSynthesis.getVoices().length > 0) setVoice();
        else window.speechSynthesis.onvoiceschanged = setVoice;
    }

    // Helper: Scroll to Bottom
    function scrollToBottom() {
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    // Helper: Add Quick Alert Buttons
    function addQuickAlerts() {
        if (chatbotMessages.querySelector('.chatbot-quick-alerts:last-child')) return;
        const alertsDiv = document.createElement('div');
        alertsDiv.className = 'chatbot-quick-alerts';
        EMERGENCY_ACTIONS.forEach(action => {
            const btn = document.createElement('button');
            btn.className = 'quick-alert-btn';
            btn.innerHTML = `<span>${action.icon}</span> ${action.label}`;
            btn.onclick = () => handleQuickAlert(action.type);
            alertsDiv.appendChild(btn);
        });
        chatbotMessages.appendChild(alertsDiv);
        scrollToBottom();
    }

    // Helper: Handle Quick Alert Trigger
    function handleQuickAlert(type) {
        chatbotWindow.classList.remove('active');
        const isResidentPage = window.location.pathname.includes('resident') || document.getElementById('tabHome');
        if (isResidentPage) {
            const homeBtn = document.getElementById('navBtnHome');
            if (homeBtn && !homeBtn.classList.contains('active')) homeBtn.click();
            if (typeof window.openEmergencyModal === 'function') {
                window.selectedEmergencyType = type;
                window.openEmergencyModal();
            }
        }
    }

    // Helper: Show Typing Indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-' + Date.now();
        typingDiv.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
        chatbotMessages.appendChild(typingDiv);
        scrollToBottom();
        return typingDiv.id;
    }

    // Helper: Remove Typing Indicator
    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // AI API Call
    async function callChatAPI() {
        if (!CHAT_API_KEY) throw new Error("API Key missing");

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...chatHistory.slice(-6) // Reduced slice for token room with images
        ];

        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CHAT_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CHAT_MODEL,
                messages: messages,
                temperature: 0.5,
                max_tokens: 512
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "API Error");
        return data.choices[0].message.content;
    }
}

// Ensure initialization regardless of load timing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
