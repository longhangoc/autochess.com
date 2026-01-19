/**
 * Main Content Script - Orchestrates các components
 */

let boardDetector, apiClient, moveExecutor, overlayUI, settings;
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
}

async function connectToAPI() {
    try {
        await apiClient.connect();
        if (boardDetector.gameActive) {
            const fen = boardDetector.getCurrentFEN();
            if (fen) requestAnalysis(fen);
        }
    } catch (e) {
        console.error('[API] Connect failed:', e);
    }
}

function requestAnalysis(fen) {
    overlayUI.showThinking();
    apiClient.analyzePosition(fen, {
        depth: settings.depth,
        variants: settings.variants,
        mode: 'bestmove'
    });
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
