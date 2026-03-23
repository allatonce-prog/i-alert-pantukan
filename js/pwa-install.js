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
        this.settingsBtns = []; // Buttons inside settings modals
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
            this.bindSettingsButtons();
            this.setupListeners();
            
            // Proactively show buttons after a delay if not running in standalone mode
            // This is for environments where the browser support exists but the prompt is delayed
            setTimeout(() => {
                if (!this.isAppInstalled()) {
                    this.showSettingsButtons();
                }
            }, 2000);
        });
    }

    isAppInstalled() {
        // Check if browser is running in standalone mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           window.navigator.standalone || 
                           document.referrer.includes('android-app://');
        
        if (isStandalone) {
            this.hideAllInstallUI();
        }
        return isStandalone;
    }

    hideAllInstallUI() {
        // Hide settings buttons if app is already installed
        document.querySelectorAll('.pwa-install-trigger').forEach(btn => {
            const section = btn.closest('.setting-row') || btn.closest('.setting-item');
            if (section) section.style.display = 'none';
        });
    }

    bindSettingsButtons() {
        this.settingsBtns = document.querySelectorAll('.pwa-install-trigger');
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        this.settingsBtns.forEach(btn => {
            // Hide by default
            const section = btn.closest('.setting-row') || btn.closest('.setting-item');
            if (section) section.style.display = 'none';

            // On iOS, we show it manually because there's no 'beforeinstallprompt' event
            if (isIOS) {
                if (section) section.style.display = (section.classList.contains('setting-item')) ? 'flex' : 'block';
            }

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleInstallClick();
            });
        });
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
            this.installBtn.addEventListener('click', () => this.handleInstallClick());
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

    showSettingsButtons() {
        this.settingsBtns.forEach(btn => {
            const section = btn.closest('.setting-row') || btn.closest('.setting-item');
            if (section) section.style.display = 'flex';
        });
    }

    async handleInstallClick() {
        if (!this.deferredPrompt) {
            // On iOS, manual trigger can just show the instructions card
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                this.showCard(true); // Force show card even if dismissed
            } else {
                console.log('[PWA] No install prompt available or already installed');
                // Optionally show a toast if no prompt is ready
                if (window.showToast) {
                    window.showToast('Browser is not ready to install. Try again in a few seconds.', 'info');
                }
                this.hideCard();
            }
            return;
        }
        
        // Show the install prompt
        this.deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            this.hideCard();
            this.hideAllInstallUI();
        }
        this.deferredPrompt = null;
    }

    showCard(force = false) {
        if (!force) {
            const dismissed = localStorage.getItem('pwa-install-dismissed');
            if (dismissed) {
                const now = new Date().getTime();
                if (now < parseInt(dismissed)) return;
            }
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
