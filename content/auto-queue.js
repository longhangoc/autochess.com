class AutoQueueManager {
    constructor(overlay) {
        this.overlay = overlay;
        this.isQueuing = false;
        this.gameModeMap = {
            'bullet': '1 min',
            'blitz_3': '3 min',
            'blitz_5': '5 min',
            'rapid_10': '10 min'
        };
    }

    async checkForAutoQueue() {
        if (!this.overlay.settings.autoQueueEnabled || this.isQueuing) return;

        // Detect game over
        const gameOverModal = document.querySelector('.game-over-modal-content, .game-result-component');
        if (!gameOverModal) return;

        this.isQueuing = true;
        console.log('[AutoQueue] Game over detected. Queuing in 5s...');

        // Human-like pause
        await this._sleep(3000 + Math.random() * 4000);

        try {
            await this._triggerNewGame();
        } catch (e) {
            console.error('[AutoQueue] Failed:', e);
        } finally {
            this.isQueuing = false;
        }
    }

    async _triggerNewGame() {
        // Mode: 'same' or specific like 'rapid_10'
        const mode = this.overlay.settings.autoQueueMode || 'same';

        if (mode === 'same') {
            // Look for "Rematch" or "New Game" button
            const btns = Array.from(document.querySelectorAll('button'));
            const playAgain = btns.find(b => b.innerText.match(/Play Again|Chơi lại|Rematch|New Game|Ván cờ mới/i));

            if (playAgain) {
                console.log('[AutoQueue] Clicking "Play Again"...');
                playAgain.click();
                return;
            }
        }

        // If specific mode or "Play Again" not found, go to New Game tab
        console.log(`[AutoQueue] Starting new ${mode} game...`);

        // 1. Click "New Game" tab if needed
        const newGameTab = document.querySelector('.tabs-tab'); // Usually the first tab
        if (newGameTab && !newGameTab.classList.contains('active')) {
            newGameTab.click();
            await this._sleep(500);
        }

        // 2. Open Time Control Dropdown if needed
        // Assuming we are on the play menu
        // This is complex as it requires interacting with the dropdown.
        // For MVP, we'll try to click the "Play" button directly if it matches, 
        // OR try to find the specific time control button if visible.
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

if (typeof window !== 'undefined') {
    window.AutoQueueManager = AutoQueueManager;
}
