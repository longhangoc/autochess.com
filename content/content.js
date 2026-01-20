/**
 * Main Content Script - Orchestrates các components
 */

let boardDetector, apiClient, moveExecutor, overlayUI, opponentStatsOverlay, settings;
let autoPlayQueue = [];
let isProcessingMove = false;

async function initExtension() {
    try {
        await waitForBoard();

        boardDetector = new ChessBoardDetector();
        if (!boardDetector.init()) return;

        apiClient = new ChessAPIClient();

        moveExecutor = new MoveExecutor(boardDetector);
        moveExecutor.init();

        overlayUI = new OverlayUI(boardDetector, apiClient, moveExecutor);
        await overlayUI.init();

        // Init Opponent Stats Overlay
        if (window.OpponentStatsOverlay) {
            opponentStatsOverlay = new OpponentStatsOverlay();
            opponentStatsOverlay.init();
        }

        settings = overlayUI.settings;

        setupAPICallbacks();
        setupBoardCallbacks();
        connectToAPI();
    } catch (e) {
        console.error('[Extension] Init failed:', e);
    }
}

function waitForBoard() {
    return new Promise(resolve => {
        const check = () => {
            const board = document.querySelector('chess-board, wc-chess-board, .board');
            board ? resolve() : setTimeout(check, 1000);
        };
        check();
    });
}

function setupAPICallbacks() {
    apiClient.onBestMove(analysis => {
        lastProcessedFen = boardDetector.getCurrentFEN() || ''; // Mark as processed
        const parsed = {
            move: analysis.from && analysis.to ? analysis.from + analysis.to + (analysis.promotion || '') : null,
            from: analysis.from,
            to: analysis.to,
            promotion: analysis.promotion,
            eval: analysis.eval || 0,
            depth: analysis.depth || 12,
            winChance: analysis.winChance || 50,
            mate: analysis.mate,
            san: analysis.san,
            piece: analysis.piece,
            captured: analysis.captured,
            continuation: analysis.continuationArr?.join(' ') || ''
        };

        overlayUI.updateAnalysis(parsed);
        overlayUI.hideThinking();

        if (settings.highlightEnabled && parsed.from && parsed.to) {
            overlayUI.highlightBestMove(parsed);
        }
    });

    apiClient.onMove(analysis => {
        if (analysis.depth && analysis.eval !== undefined) {
            overlayUI.showProgressiveAnalysis?.(analysis);
        }
    });

    apiClient.onConnect(() => {
        console.log('[API] Connected');
        overlayUI.updateConnectionStatus(true);

        // AUTO-RESUME: Nếu đang trong trận, tự động phân tích ngay khi có lại kết nối
        if (overlayUI.gameState.isInGame) {
            console.log('[Extension] Connection restored - Auto resuming analysis...');
            const fen = overlayUI._getBoardFEN(); // Lấy FEN từ OverlayUI để đồng bộ
            if (fen) requestAnalysis(fen);
        }
    });

    apiClient.onDisconnect(() => {
        console.log('[API] Disconnected');
        overlayUI.updateConnectionStatus(false);
    });

    apiClient.onError(e => {
        console.error('[API] Error:', e);
        overlayUI.updateConnectionStatus(false);
    });
}

let lastFenRequestTime = 0;
let lastProcessedFen = '';

function setupBoardCallbacks() {
    boardDetector.onBoardChange(fen => requestAnalysis(fen));
    boardDetector.onMove((newFEN) => {
        overlayUI.clearHighlights();
        requestAnalysis(newFEN);
    });
    boardDetector.onGameStart(() => {
        const fen = boardDetector.getCurrentFEN();
        if (fen) requestAnalysis(fen);
    });

    startWatchdog();
}

function startWatchdog() {
    setInterval(() => {
        if (!settings?.autoPlayEnabled) return;

        // Watchdog Logic: Aggressive Fail-safe
        if (overlayUI.gameState.isInGame && overlayUI.gameState.isMyTurn) {
            // Nếu đang auto-executing thì bỏ qua
            if (overlayUI.isAutoExecuting) return;

            const currentFen = boardDetector.getCurrentFEN();
            if (!currentFen) return;

            // FIX: Bỏ check lastProcessedFen. 
            // Logic mới: Cứ đến lượt mình mà quá 4s chưa request lại -> Force Analyze
            // Điều này đảm bảo nếu analysis về mà không đi (do lỗi) thì nó sẽ thử lại mãi.
            if (Date.now() - lastFenRequestTime > 4000) {
                console.log('[Watchdog] ♻️ Retry/Stuck logic: Force analyzing...', currentFen);
                requestAnalysis(currentFen);
            }
        }
    }, 2000);
}

async function connectToAPI() {
    try {
        await apiClient.connect();

        // Wait a bit for DOM stabilitiztion
        await sleep(1000);

        // Force check game state via OverlayUI (more robust)
        overlayUI._updateGameState();

        if (overlayUI.gameState.isInGame) {
            console.log('[Extension] Initial game detected - Requesting analysis...');
            const fen = overlayUI._generateFEN() || boardDetector.getCurrentFEN();
            if (fen) requestAnalysis(fen);
        }
    } catch (e) {
        console.error('[API] Connect failed:', e);
    }
}

function requestAnalysis(fen) {
    lastFenRequestTime = Date.now(); // Update timestamp cho Watchdog
    overlayUI.showThinking();
    const opts = {
        depth: settings.depth,
        variants: settings.variants || 1,
        mode: 'bestmove'
    };
    if (settings.nodesLimit > 0) opts.nodes = settings.nodesLimit;

    apiClient.analyzePosition(fen, opts);
}

function queueMove(analysis) {
    if (!analysis?.move || analysis.move.length < 4) return;

    const m = analysis.move;
    autoPlayQueue.push({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length > 4 ? m[4] : null
    });

    if (!isProcessingMove) processAutoPlayQueue();
}

function gaussianDelay(min, max) {
    const u1 = Math.random(), u2 = Math.random();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const center = (min + max) / 2, range = (max - min) / 4;
    return Math.max(min, Math.min(max, Math.floor(center + g * range)));
}

async function processAutoPlayQueue() {
    if (!autoPlayQueue.length) {
        isProcessingMove = false;
        return;
    }

    isProcessingMove = true;
    const move = autoPlayQueue.shift();

    const baseDelay = 1000;
    await sleep(gaussianDelay(baseDelay * 0.5, baseDelay * 2.5));

    if (!(overlayUI?.gameState?.isMyTurn ?? boardDetector.isMyTurn())) {
        isProcessingMove = false;
        autoPlayQueue = [];
        return;
    }

    await moveExecutor.executeMove(move);
    await sleep(gaussianDelay(200, 600));

    isProcessingMove = false;
    if (autoPlayQueue.length) processAutoPlayQueue();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

window.addEventListener('beforeunload', () => {
    boardDetector?.destroy();
    apiClient?.disconnect();
    overlayUI?.destroy();
});

document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', initExtension)
    : initExtension();
