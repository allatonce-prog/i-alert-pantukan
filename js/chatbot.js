/**
 * iAlert Pantukan - Chatbot Assistant
 * Powered by Groq AI
 */

const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // High-speed, high-quality model

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
5. If you don't know something specific about Pantukan's local laws, advise checking with the local government office.`;

function initChatbot() {
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close');
    const chatbotWindow = document.getElementById('chatbot-window');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotSend = document.getElementById('chatbot-send');

    let chatHistory = [];

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
            const responseText = await callGroqAPI();
            removeTypingIndicator(typingId);
            addMessage(responseText, 'bot');
            chatHistory.push({ role: "assistant", content: responseText });
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
        chatbotMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    // Helper: Scroll to Bottom
    function scrollToBottom() {
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
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

    // Groq API Call
    async function callGroqAPI() {
        // Construct the full prompt with system instructions
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...chatHistory.slice(-8) // Keep last 4 exchanges for context
        ];

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Groq API error");
        }

        return data.choices[0].message.content;
    }
}

// Ensure initialization regardless of load timing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}
