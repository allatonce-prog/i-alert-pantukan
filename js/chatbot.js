/**
 * iAlert Pantukan - Chatbot Assistant
 * Powered by Groq AI (with Voice Support)
 */

// Fallback key (Replaced by Firestore config)
let CHAT_API_KEY = "";
const CHAT_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "llama-3.3-70b-versatile";

// Centralized Configuration Loader
async function syncGrokConfig() {
    try {
        const doc = await db.collection('config').doc('chatbot').get();
        if (doc.exists) {
            const data = doc.data();
            // Check multiple potential field names for the Grok key
            const key = data.apiKey || data.groqApiKey;
            if (key) {
                CHAT_API_KEY = key.trim();
                console.log("[Chatbot] API Key successfully synced");
            } else {
                console.warn("[Chatbot] Document exists but no API key field found");
            }
        } else {
            console.warn("[Chatbot] No config/chatbot document found in Firestore");
        }
    } catch (e) {
        console.error("[Chatbot] Firestore sync failed:", e);
    }
}
syncGrokConfig();

const SYSTEM_PROMPT = `You are the iAlert Pantukan Assistant, an emergency response AI for the Municipality of Pantukan.
Your goal is to provide safety tips, emergency procedures, and guide residents on how to use the iAlert system.

Guidelines:
1. If a user describes a real-time emergency (e.g., "There is a fire right now!"), strongly advise them to click the "SEND ALERT" button on the dashboard immediately to notify authorities.
2. Provide concise, actionable safety tips for categories like:
   - Fire (escape routes, fire extinguisher use)
   - Medical (CPR basics, first aid for wounds)
   - Police (personal safety, reporting crimes)
   - Rescue (flood safety, earthquake drills)
   - Road Accidents (securing the scene, calling for help)
3. Be professional, empathetic, and always ready to help.
4. Keep your responses relatively short (under 150 words) for better mobile readability.
5. If you don't know something specific about Pantukan's local laws, advise checking with the local government office.
6. When the user mentions an emergency or asks for help with one, mention that they can use the "Quick Alert" buttons below to send an official report immediately.`;

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

    // Handle Sending Message
    const sendMessage = async () => {
        const message = chatbotInput.value.trim();
        if (!message) return;

        // Add user message to UI
        addMessage(message, 'user');
        chatbotInput.value = '';
        chatbotInput.style.height = 'auto';

        // Add to history
        chatHistory.push({ role: "user", content: message });

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const responseText = await callChatAPI();
            removeTypingIndicator(typingId);
            addMessage(responseText, 'bot');
            chatHistory.push({ role: "assistant", content: responseText });

            // Grok Voice Support: Speak the response
            speakResponse(responseText);

            // Check if we should show quick alerts
            const emergencyKeywords = ['emergency', 'fire', 'police', 'medical', 'rescue', 'accident', 'help', 'alert', 'situation', 'happening'];
            const shouldShowAlerts = emergencyKeywords.some(kw =>
                responseText.toLowerCase().includes(kw) ||
                message.toLowerCase().includes(kw)
            );

            if (shouldShowAlerts) {
                setTimeout(() => addQuickAlerts(), 500);
            }
        } catch (error) {
            console.error("Chatbot Error:", error);
            removeTypingIndicator(typingId);

            let userFriendlyMsg = "I'm sorry, I'm having trouble connecting right now. Please try again later.";
            if (error.message.includes("quota") || error.message.includes("429")) {
                userFriendlyMsg = "I've reached my message limit (API Quota Exceeded). Please try again in a few minutes.";
            } else if (error.message.includes("api_key")) {
                userFriendlyMsg = "There's an issue with the AI API key. Please contact support.";
            }

            addMessage(userFriendlyMsg, 'bot');
        }
    };

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

        // Auto-resize textarea
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

        // Add "Listen" button to bot messages
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

    // Helper: Speak Response (Grok Voice Output)
    // Helper: Speak Response (Grok Voice Output)
    function speakResponse(text) {
        if (!window.speechSynthesis) return;

        // Cancel any current speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        const setVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            // Prioritize high-quality English voices
            const preferredVoice = voices.find(v => v.name.toLocaleLowerCase().includes('premium') && v.lang.startsWith('en')) ||
                voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                voices.find(v => v.lang.startsWith('en')) ||
                voices[0];

            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.rate = 1.05; // Slightly faster for modern feel
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            setVoice();
        } else {
            // Voices might load asynchronously
            window.speechSynthesis.onvoiceschanged = setVoice;
        }
    }

    // Helper: Scroll to Bottom
    function scrollToBottom() {
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    // Helper: Add Quick Alert Buttons
    function addQuickAlerts() {
        // Check if last message already had alerts (prevent duplicates)
        if (chatbotMessages.querySelector('.chatbot-quick-alerts:last-child')) return;

        const alertsDiv = document.createElement('div');
        alertsDiv.className = 'chatbot-quick-alerts';

        // Add "Send Alert" header if desired, or just buttons
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
        // Close chatbot window first for better focus on alert progress
        chatbotWindow.classList.remove('active');

        // Check environment (Resident or Admin)
        const isResidentPage = window.location.pathname.includes('resident') || document.getElementById('tabHome');

        if (isResidentPage) {
            // 1. Switch to Home Tab if not already there
            const homeBtn = document.getElementById('navBtnHome');
            if (homeBtn && !homeBtn.classList.contains('active')) {
                homeBtn.click();
            }

            // 2. Trigger the global resident alert function
            if (typeof window.openEmergencyModal === 'function') {
                window.selectedEmergencyType = type;
                window.openEmergencyModal();
            } else {
                console.error("openEmergencyModal not found. Ensure resident.js is loaded correctly.");
                if (window.showToast) window.showToast("Opening emergency form...", "info");
            }
        } else {
            // Admin environment or other - Notify that this is for residents
            if (window.showToast) {
                window.showToast(`Emergency alert (${type.toUpperCase()}) triggered. Only residents can send official reports.`, 'warning');
            } else {
                alert(`Note: Official emergency triggers are for residents. Admin is for monitoring.`);
            }
        }
    }

    // Helper: Show Typing Indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-' + Date.now();
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
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
        if (!CHAT_API_KEY) {
            throw new Error("api_key_missing: AI API key not configured in Firestore.");
        }

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...chatHistory.slice(-10)
        ];

        try {
            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CHAT_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: CHAT_MODEL,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("[Chatbot API Error]", data);
                throw new Error(data.error?.message || `API error: ${response.status}`);
            }

            return data.choices[0].message.content;
        } catch (err) {
            console.error("[Chatbot Network Error]", err);
            throw err;
        }
    }
}

// Ensure initialization regardless of load timing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
