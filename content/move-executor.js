/**
 * Move Executor - Thực hiện nước đi trên Chess.com
 */

class MoveExecutor {
    constructor(boardDetector) {
        this.boardDetector = boardDetector;
        this.board = null;
        this.isExecuting = false;
        this.humanBehavior = window.HumanBehavior ? new window.HumanBehavior() : null;
    }

    init() {
        this.board = this.boardDetector.board;
        console.log('[MoveExecutor] Initialized');
    }

    async executeMove(move) {
        if (this.isExecuting) return false;
        this.isExecuting = true;

        try {
            const fromCoords = this._getSquareCoords(move.from);
            const toCoords = this._getSquareCoords(move.to);

            if (!fromCoords || !toCoords) {
                console.error('[MoveExecutor] Invalid coordinates');
                return this._fail();
            }

            const piece = this._findPiece(move.from);
            if (!piece) {
                console.error('[MoveExecutor] No piece at', move.from);
                return this._fail();
            }

            console.log(`[MoveExecutor] ${move.from} → ${move.to}`);
            const success = await this._performDrag(piece, fromCoords, toCoords);

            if (!success) return this._fail();

            if (move.promotion) {
                await this.sleep(300);
                await this._handlePromotion(move.promotion);
            }

            this.isExecuting = false;
            return true;
        } catch (e) {
            console.error('[MoveExecutor] Error:', e);
            return this._fail();
        }
    }

    _fail() {
        this.isExecuting = false;
        return false;
    }

    _findPiece(square) {
        const file = square.charCodeAt(0) - 96;
        const rank = parseInt(square[1]);
        const cls = `square-${file}${rank}`;
        return document.querySelector(`.piece[class*="${cls}"]`);
    }

    async _performDrag(piece, from, to) {
        try {
            if (this.humanBehavior) await this.humanBehavior.simulateHesitation();
            await this.sleep(this._rand(100, 300));

            // Start drag
            this._mouseEvent(piece, 'mouseover', from.x, from.y);
            this._mouseEvent(piece, 'mouseenter', from.x, from.y);
            await this.sleep(this._rand(50, 150));

            this._mouseEvent(piece, 'mousedown', from.x, from.y, { buttons: 1, button: 0 });
            this._pointerEvent(piece, 'pointerdown', from.x, from.y);
            this._dragEvent(piece, 'dragstart', from.x, from.y);
            await this.sleep(this._rand(50, 100));

            // Move along path
            const path = this.humanBehavior
                ? this.humanBehavior.generateBezierPath(from.x, from.y, to.x, to.y, 25)
                : this._linearPath(from, to, 15);

            for (let i = 0; i < path.length; i++) {
                const { x, y } = path[i];
                this._mouseEvent(piece, 'mousemove', x, y, { buttons: 1 });
                this._pointerEvent(piece, 'pointermove', x, y);
                this._dragEvent(piece, 'drag', x, y);

                const progress = i / path.length;
                const speed = this.humanBehavior?.getDragSpeed(progress) || 1;
                await this.sleep((15 + Math.random() * 25) / (speed + 0.5));
            }

            // Drop
            const target = document.elementFromPoint(to.x, to.y);
            if (!target) return false;

            this._dragEvent(target, 'dragover', to.x, to.y);
            await this.sleep(this._rand(30, 80));

            this._dragEvent(target, 'drop', to.x, to.y);
            this._dragEvent(piece, 'dragend', to.x, to.y);
            this._mouseEvent(target, 'mouseup', to.x, to.y, { buttons: 0, button: 0 });
            this._pointerEvent(target, 'pointerup', to.x, to.y);

            await this.sleep(this._rand(20, 50));
            this._mouseEvent(target, 'click', to.x, to.y);

            return true;
        } catch (e) {
            console.error('[MoveExecutor] Drag error:', e);
            return false;
        }
    }

    _linearPath(from, to, steps) {
        const path = [];
        for (let i = 0; i <= steps; i++) {
            const p = i / steps;
            path.push({
                x: from.x + (to.x - from.x) * p,
                y: from.y + (to.y - from.y) * p
            });
        }
        return path;
    }

    _mouseEvent(el, type, x, y, opts = {}) {
        el.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: opts.button ?? 0, buttons: opts.buttons ?? 0, ...opts
        }));
    }

    _pointerEvent(el, type, x, y) {
        el.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y, screenX: x, screenY: y,
            pointerId: 1, width: 1, height: 1,
            pressure: type.includes('down') ? 0.5 : 0,
            isPrimary: true, pointerType: 'mouse'
        }));
    }

    _dragEvent(el, type, x, y) {
        el.dispatchEvent(new DragEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y,
            dataTransfer: type === 'dragstart' || type === 'drop' ? new DataTransfer() : undefined
        }));
    }

    _getSquareCoords(square) {
        const board = document.querySelector('wc-chess-board') ||
            document.querySelector('chess-board') ||
            document.querySelector('.board');

        if (!board) return null;

        const rect = board.getBoundingClientRect();
        if (!rect || rect.width === 0) return null;

        const sqW = rect.width / 8;
        const sqH = rect.height / 8;

        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;
        if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

        const isFlipped = board.classList.contains('flipped');
        const fileIdx = isFlipped ? 7 - file : file;
        const rankIdx = isFlipped ? rank : 7 - rank;

        return {
            x: rect.left + fileIdx * sqW + sqW / 2,
            y: rect.top + rankIdx * sqH + sqH / 2
        };
    }

    async _handlePromotion(promotionType) {
        // promotionType: 'q' (Queen), 'r' (Rook), 'n' (Knight), 'b' (Bishop)
        console.log('[MoveExecutor] Handling promotion to:', promotionType);

        // Wait for promotion dialog
        await this.sleep(400);

        // Chess.com uses: .promotion-piece.wq, .promotion-piece.bq, etc.
        // Try finding the promotion window first
        const promotionWindow = document.querySelector('.promotion-window');
        if (!promotionWindow) {
            console.warn('[MoveExecutor] Promotion window not found');
            return;
        }

        // Map promotion type to piece class
        const pieceType = promotionType.toLowerCase();

        // Try both white and black selectors
        const selectors = [
            `.promotion-piece.w${pieceType}`,  // White: wq, wr, wn, wb
            `.promotion-piece.b${pieceType}`,  // Black: bq, br, bn, bb
            `.promotion-piece[class*="${pieceType}"]`,
            `.${pieceType}` // Fallback
        ];

        let pieceEl = null;
        for (const sel of selectors) {
            pieceEl = promotionWindow.querySelector(sel) || document.querySelector(sel);
            if (pieceEl) break;
        }

        if (pieceEl) {
            const r = pieceEl.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;

            // Human-like delay before clicking
            await this.sleep(this._rand(100, 300));

            this._mouseEvent(pieceEl, 'mousedown', x, y, { button: 0 });
            await this.sleep(50);
            this._mouseEvent(pieceEl, 'mouseup', x, y, { button: 0 });
            this._mouseEvent(pieceEl, 'click', x, y);

            console.log('[MoveExecutor] Clicked promotion piece:', pieceType);
        } else {
            console.warn('[MoveExecutor] Promotion piece not found for:', pieceType);

            // Fallback: Click first piece (Queen - top option)
            const firstPiece = promotionWindow.querySelector('.promotion-piece');
            if (firstPiece) {
                const r = firstPiece.getBoundingClientRect();
                this._mouseEvent(firstPiece, 'click', r.left + r.width / 2, r.top + r.height / 2);
                console.log('[MoveExecutor] Fallback: clicked first promotion piece');
            }
        }
    }

    _rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

if (typeof window !== 'undefined') {
    window.MoveExecutor = MoveExecutor;
}
