/**
 * Chess API WebSocket Client - Kết nối với chess-api.com Stockfish
 */

class ChessAPIClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnect = 5;
        this.reconnectDelay = 2000;

        this.callbacks = {
            move: null, bestMove: null, info: null,
            connect: null, disconnect: null, error: null
        };
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            this.ws?.close();
            this.ws = new WebSocket('wss://chess-api.com/v1');

            const timeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log('[API] ✅ Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.callbacks.connect?.();
                resolve();
            };

            this.ws.onmessage = e => this._handleMessage(e.data);

            this.ws.onerror = (err) => {
                clearTimeout(timeout);
                console.error('[API] ❌ Error:', err);
                this.callbacks.error?.(err);
                if (!this.isConnected) reject(err);
            };

            this.ws.onclose = () => {
                clearTimeout(timeout);
                console.log('[API] Disconnected');
                this.isConnected = false;
                this.callbacks.disconnect?.();
                this._attemptReconnect();
            };
        });
    }

    _handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            console.log('[API] Received:', msg);

            if (msg.move || msg.san) {
                msg.type === 'bestmove'
                    ? this.callbacks.bestMove?.(msg)
                    : this.callbacks.move?.(msg);
                return;
            }

            switch (msg.type) {
                case 'move': this.callbacks.move?.(msg); break;
                case 'bestmove': this.callbacks.bestMove?.(msg); break;
                case 'info': case 'log': this.callbacks.info?.(msg); break;
                case 'error':
                    console.error('[API] Error:', msg.text || msg);
                    this.callbacks.error?.(msg);
                    break;
                default:
                    if (msg.eval !== undefined) this.callbacks.move?.(msg);
            }
        } catch (e) {
            console.error('[API] Parse error:', e);
        }
    }

    analyzePosition(fen, opts = {}) {
        if (!this.isConnected) return false;

        const req = {
            fen,
            variants: opts.variants || 3,
            depth: opts.depth || 12,
            maxThinkingTime: opts.maxThinkingTime || 50,
            taskId: opts.taskId || this._genId()
        };

        if (opts.searchmoves) req.searchmoves = opts.searchmoves;

        try {
            this.ws.send(JSON.stringify(req));
            console.log('[API] Analyzing:', req.fen.split(' ')[0]);
            return true;
        } catch (e) {
            console.error('[API] Send failed:', e);
            return false;
        }
    }

    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnect) {
            console.error('[API] Max reconnect reached');
            return;
        }
        this.reconnectAttempts++;
        console.log(`[API] Reconnecting (${this.reconnectAttempts}/${this.maxReconnect})...`);
        setTimeout(() => this.connect().catch(() => { }), this.reconnectDelay);
    }

    disconnect() {
        this.ws?.close();
        this.ws = null;
        this.isConnected = false;
    }

    _genId() {
        return Math.random().toString(36).slice(2, 11);
    }

    // Callbacks
    onMove(cb) { this.callbacks.move = cb; }
    onBestMove(cb) { this.callbacks.bestMove = cb; }
    onInfo(cb) { this.callbacks.info = cb; }
    onConnect(cb) { this.callbacks.connect = cb; }
    onDisconnect(cb) { this.callbacks.disconnect = cb; }
    onError(cb) { this.callbacks.error = cb; }

    getConnectionStatus() { return this.isConnected; }
}

if (typeof window !== 'undefined') {
    window.ChessAPIClient = ChessAPIClient;
}
