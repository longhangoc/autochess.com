/**
 * Chess Board Detector - Phát hiện và extract thông tin từ bàn cờ Chess.com
 */

class ChessBoardDetector {
    constructor() {
        this.board = null;
        this.currentFEN = null;
        this.playerColor = null;
        this.isPlayerTurn = false;
        this.gameActive = false;
        this.observer = null;
        this.updateTimeout = null;

        // Game Time Info
        this.gameTimeLimit = 600; // Default 10 mins (in seconds)
        this.gameTimeType = 'rapid'; // bullet, blitz, rapid

        this.onBoardChangeCallback = null;
        this.onMoveCallback = null;
        this.onGameStartCallback = null;
        this.onGameEndCallback = null;
    }

    init() {
        console.log('[BoardDetector] Initializing...');
        this.findBoard();

        if (this.board) {
            console.log('[BoardDetector] Board found!');
            this.detectPlayerColor();
            this.detectGameTime(); // Detect time on init
            this.updateCurrentFEN();
            this._setupObserver();
            this.onGameStartCallback?.();
            this.gameActive = true;
            return true;
        }

        console.log('[BoardDetector] No board, retrying...');
        setTimeout(() => this.init(), 2000);
        return false;
    }

    findBoard() {
        const selectors = ['chess-board', 'wc-chess-board', '.board', '[class*="board-"]'];
        for (const s of selectors) {
            const b = document.querySelector(s);
            if (b) { this.board = b; return b; }
        }
        return null;
    }

    detectPlayerColor() {
        this.playerColor = this.board.classList.contains('flipped') ? 'black' : 'white';
        console.log('[BoardDetector] Player:', this.playerColor);
    }

    // Detect initial game time from clocks
    detectGameTime() {
        try {
            // Find clocks
            const clocks = document.querySelectorAll('.clock-time-monospace, .clock-component');
            if (!clocks.length) return;

            // Get text (e.g., "10:00", "3:00", "1:00")
            // Usually init time is the max time found or the bottom clock if game just started
            let maxSeconds = 0;

            clocks.forEach(clock => {
                const text = clock.textContent?.trim(); // "10:00"
                if (!text || !text.includes(':')) return;

                const parts = text.split(':');
                let seconds = 0;
                if (parts.length === 2) {
                    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                } else if (parts.length === 3) { // 1:00:00? Unlikely for normal chess but possible
                    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                }

                if (seconds > maxSeconds) maxSeconds = seconds;
            });

            if (maxSeconds > 0) {
                this.gameTimeLimit = maxSeconds;

                // Determine type
                if (this.gameTimeLimit <= 120) this.gameTimeType = 'bullet'; // <= 2 mins
                else if (this.gameTimeLimit <= 300) this.gameTimeType = 'blitz'; // <= 5 mins
                else this.gameTimeType = 'rapid'; // > 5 mins

                console.log(`[BoardDetector] Detected Time: ${this.gameTimeLimit}s (${this.gameTimeType})`);
            }
        } catch (e) {
            console.error('[BoardDetector] Time detection failed:', e);
        }
    }

    updateCurrentFEN() {
        try {
            let fen = this.board.getAttribute('data-fen') || this._parseFEN();
            if (fen && fen !== this.currentFEN) {
                this.currentFEN = fen;
                this.onBoardChangeCallback?.(fen);
            }
            return fen;
        } catch { return null; }
    }

    _parseFEN() {
        let pieces = document.querySelectorAll('.piece');
        if (!pieces.length && this.board) pieces = this.board.querySelectorAll('.piece');

        const board = Array(8).fill(null).map(() => Array(8).fill(''));

        pieces.forEach(piece => {
            const classes = Array.from(piece.classList);
            let rank = null, file = null, char = '';

            for (const cls of classes) {
                if (cls.startsWith('square-')) {
                    const pos = cls.slice(7);
                    if (pos.length === 2 && !isNaN(pos)) {
                        file = parseInt(pos[0]) - 1;
                        rank = 8 - parseInt(pos[1]);
                    }
                }
                if (cls.length === 2 && 'wb'.includes(cls[0]) && 'pnbrqk'.includes(cls[1])) {
                    char = cls[0] === 'w' ? cls[1].toUpperCase() : cls[1];
                }
            }

            if (char && rank !== null && file !== null) board[rank][file] = char;
        });

        let fen = '';
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let f = 0; f < 8; f++) {
                if (board[r][f]) {
                    if (empty) { fen += empty; empty = 0; }
                    fen += board[r][f];
                } else empty++;
            }
            if (empty) fen += empty;
            if (r < 7) fen += '/';
        }

        if (!this._validateFEN(fen)) return null;

        const turn = this._detectTurn();
        const castling = this._getCastling(board);
        fen += ` ${turn} ${castling} - 0 1`;

        return fen;
    }

    _validateFEN(fen) {
        if (!fen) return false;
        const hasK = fen.includes('K'), hask = fen.includes('k');
        if (!hasK || !hask) return false;
        return fen.split('/').length === 8;
    }

    _getCastling(board) {
        let r = '';
        if (board[7][4] === 'K') {
            if (board[7][7] === 'R') r += 'K';
            if (board[7][0] === 'R') r += 'Q';
        }
        if (board[0][4] === 'k') {
            if (board[0][7] === 'r') r += 'k';
            if (board[0][0] === 'r') r += 'q';
        }
        return r || '-';
    }

    _detectTurn() {
        // Check active clock
        const clockTurn = document.querySelector('.clock-player-turn');
        if (clockTurn) {
            if (clockTurn.classList.contains('white')) return 'w';
            if (clockTurn.classList.contains('black')) return 'b';
        }

        // Count moves
        const moves = document.querySelectorAll('wc-simple-move-list .node.main-line-ply, .move-list .node');
        const count = Array.from(moves).filter(n => n.textContent?.trim()).length;
        return count % 2 === 0 ? 'w' : 'b';
    }

    checkIfPlayerTurn() {
        const turn = this._detectTurn();
        this.isPlayerTurn = turn === (this.playerColor === 'white' ? 'w' : 'b');
        return this.isPlayerTurn;
    }

    _setupObserver() {
        this.observer?.disconnect();
        this.observer = new MutationObserver(() => {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = setTimeout(() => {
                const oldFEN = this.currentFEN;
                this.updateCurrentFEN();
                if (oldFEN !== this.currentFEN) {
                    this.onMoveCallback?.(this.currentFEN, oldFEN);
                }
                this.checkIfPlayerTurn();
            }, 300);
        });
        this.observer.observe(this.board, { attributes: true, childList: true, subtree: true });
    }

    // Callbacks
    onBoardChange(cb) { this.onBoardChangeCallback = cb; }
    onMove(cb) { this.onMoveCallback = cb; }
    onGameStart(cb) { this.onGameStartCallback = cb; }
    onGameEnd(cb) { this.onGameEndCallback = cb; }

    // Getters
    getCurrentFEN() { return this.currentFEN; }
    getPlayerColor() { return this.playerColor; }
    isMyTurn() { return this.checkIfPlayerTurn(); }
    getGameTimeLimit() { return this.gameTimeLimit; } // New method
    getGameTimeType() { return this.gameTimeType; } // New method

    destroy() {
        this.observer?.disconnect();
        this.gameActive = false;
    }
}

if (typeof window !== 'undefined') {
    window.ChessBoardDetector = ChessBoardDetector;
}
