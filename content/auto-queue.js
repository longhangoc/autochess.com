/**
 * Auto Queue Manager - Tự động tìm ván mới
 * Nhận diện nút "X phút mới" và "Tái đấu" từ modal kết thúc game
 */
class AutoQueueManager {
    constructor(overlay) {
        this.overlay = overlay;
        this.isQueuing = false;
        this.checkInterval = null;

        // Map mode setting to button text patterns
        this.modeToTimeText = {
            'bullet': ['1 phút', '1 min', '2 phút', '2 min'],
            'blitz': ['3 phút', '3 min', '5 phút', '5 min'],
            'rapid': ['10 phút', '10 min', '15 phút', '15 min', '30 phút', '30 min']
        };
    }

    startMonitoring() {
        if (this.checkInterval) return;
        this.checkInterval = setInterval(() => this._checkGameOver(), 1500);
        console.log('[AutoQueue] Monitoring started');
    }

    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    async _checkGameOver() {
        if (!this.overlay.settings.autoQueueEnabled || this.isQueuing) return;
        if (this.overlay.gameState.isInGame) return;

        // Tìm modal kết thúc game - có nút "Xem lại ván đấu" hoặc "10 phút mới"
        const gameOverIndicators = [
            'Bạn đã thắng', 'Bạn đã thua', 'Ván cờ hòa',
            'You won', 'You lost', 'Draw',
            'Xem lại ván đấu', 'Game Review'
        ];

        const pageText = document.body.innerText;
        const hasGameOver = gameOverIndicators.some(txt => pageText.includes(txt));

        // Cũng check xem có nút "X phút mới" hoặc "Tái đấu" không
        const newGameBtn = this._findNewGameButton();
        const rematchBtn = this._findRematchButton();

        if (!hasGameOver && !newGameBtn && !rematchBtn) return;

        this.isQueuing = true;
        console.log('[AutoQueue] Game over detected!');

        try {
            // Human-like pause (3-6 giây)
            const waitTime = 3000 + Math.random() * 3000;
            console.log(`[AutoQueue] Waiting ${(waitTime / 1000).toFixed(1)}s...`);
            await this._sleep(waitTime);

            await this._clickNewGame();
        } catch (e) {
            console.error('[AutoQueue] Error:', e);
        } finally {
            // Reset sau 10s để tránh spam
            setTimeout(() => { this.isQueuing = false; }, 10000);
        }
    }

    async _clickNewGame() {
        const mode = this.overlay.settings.autoQueueMode || 'same';
        console.log(`[AutoQueue] Mode: ${mode}`);

        // LUÔN click nút "X phút mới" - KHÔNG bao giờ click "Tái đấu"
        const newGameBtn = this._findNewGameButton();

        if (newGameBtn) {
            console.log('[AutoQueue] Clicking New Game button...');
            newGameBtn.click();
            return;
        }

        // Nếu có mode cụ thể (bullet/blitz/rapid), tìm nút phù hợp
        if (mode !== 'same') {
            const targetTexts = this.modeToTimeText[mode] || [];
            const specificBtn = this._findButtonByTimeTexts(targetTexts);

            if (specificBtn) {
                console.log(`[AutoQueue] Clicking ${mode} button...`);
                specificBtn.click();
                return;
            }
        }

        console.log('[AutoQueue] No "New Game" button found');
    }

    _findNewGameButton() {
        // Tìm nút có pattern "X phút mới" hoặc "X min"
        const buttons = Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase() || '';
            // Pattern: "10 phút mới", "1 phút mới", "New 10 min", etc.
            if (text.match(/\d+\s*(phút|min)/i) && !text.includes('xem lại')) {
                if (btn.offsetParent !== null) return btn; // Visible check
            }
        }

        return null;
    }

    _findRematchButton() {
        const patterns = [/tái đấu/i, /rematch/i, /play again/i, /chơi lại/i];
        const buttons = Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = btn.textContent?.trim() || '';
            if (patterns.some(p => p.test(text)) && btn.offsetParent !== null) {
                return btn;
            }
        }

        return null;
    }

    _findButtonByTimeTexts(timeTexts) {
        const buttons = Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase() || '';
            for (const timeText of timeTexts) {
                if (text.includes(timeText.toLowerCase()) && btn.offsetParent !== null) {
                    return btn;
                }
            }
        }

        return null;
    }

    _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

if (typeof window !== 'undefined') {
    window.AutoQueueManager = AutoQueueManager;
}
