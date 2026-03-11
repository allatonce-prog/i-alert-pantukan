/**
 * iAlert Pantukan - PWA Installation Manager
 * Handles cross-platform PWA installation prompts (Android & iOS)
 */

class PWAInstallManager {
    constructor() {
        this.deferredPrompt = null;
        this.installCard = null;
        this.installBtn = null;
        this.closeBtn = null;
        this.init();
    }

    init() {
        // Initial check and setup
        window.addEventListener('load', () => {
            // Check if already installed
            if (this.isAppInstalled()) {
                console.log('[PWA] App is already installed/running in standalone mode');
                return;
            }

            this.createInstallCard();
            this.setupListeners();
        });
    }

    isAppInstalled() {
        // Check if browser is running in standalone mode
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone || 
               document.referrer.includes('android-app://');
    }

    createInstallCard() {
        if (document.getElementById('pwa-install-card')) return;

        const div = document.createElement('div');
        div.id = 'pwa-install-card';
        div.className = 'pwa-install-card hidden';
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const msg = isIOS 
            ? 'Tap the <span class="ios-share-icon"></span> share button then select <b>"Add to Home Screen"</b> to install iAlert on your device.'
            : 'Install iAlert Pantukan for a faster experience and instant emergency reporting.';
        
        const btnHtml = isIOS 
            ? '' 
            : '<button id="pwa-install-btn" class="btn btn-primary">Install App</button>';

        div.innerHTML = `
            <div class="pwa-install-content">
                <div class="pwa-install-icon">
                    <img src="assets/logo/ialert.png" alt="iAlert">
                </div>
                <div class="pwa-install-text">
                    <h4>Install iAlert app</h4>
                    <p>${msg}</p>
                </div>
                ${btnHtml}
                <button id="pwa-close-btn" class="pwa-close-btn">&times;</button>
            </div>
        `;

        document.body.appendChild(div);
        this.installCard = div;
        this.installBtn = document.getElementById('pwa-install-btn');
        this.closeBtn = document.getElementById('pwa-close-btn');

        // Show iOS instructions automatically if on iOS and not dismissed
        if (isIOS) {
            this.showCard();
        }
    }

    setupListeners() {
        // Listen for beforeinstallprompt (Android/Desktop)
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[PWA] beforeinstallprompt event fired');
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            this.deferredPrompt = e;
            // Update UI to notify the user they can install the PWA
            this.showCard();
        });

        if (this.installBtn) {
            this.installBtn.addEventListener('click', async () => {
                if (!this.deferredPrompt) {
                     // If for some reason button is clicked but no prompt, hide card
                    this.hideCard();
                    return;
                }
                
                // Show the install prompt
                this.deferredPrompt.prompt();
                
                // Wait for the user to respond to the prompt
                const { outcome } = await this.deferredPrompt.userChoice;
                console.log(`[PWA] User response to the install prompt: ${outcome}`);
                
                if (outcome === 'accepted') {
                    this.hideCard();
                }
                this.deferredPrompt = null;
            });
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.hideCard();
                // Dismiss for 24 hours
                const expiry = new Date().getTime() + (24 * 60 * 60 * 1000);
                localStorage.setItem('pwa-install-dismissed', expiry.toString());
            });
        }
        
        // Listen for successful installation
        window.addEventListener('appinstalled', (event) => {
            console.log('[PWA] App successfully installed');
            this.hideCard();
        });
    }

    showCard() {
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const now = new Date().getTime();
            if (now < parseInt(dismissed)) return;
        }
        
        setTimeout(() => {
            if (this.installCard) {
                this.installCard.classList.remove('hidden');
                // Trigger animation
                setTimeout(() => {
                    this.installCard.classList.add('active');
                }, 100);
            }
        }, 1500);
    }

    hideCard() {
        if (this.installCard) {
            this.installCard.classList.remove('active');
            setTimeout(() => {
                this.installCard.classList.add('hidden');
            }, 600);
        }
    }
}

// Initialize PWA Manager
window.pwaInstallManager = new PWAInstallManager();
