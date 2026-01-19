/**
 * Overlay UI - Chess Auto-Play Extension
 */

class OverlayUI {
  constructor(boardDetector, apiClient, moveExecutor) {
    this.boardDetector = boardDetector;
    this.apiClient = apiClient;
    this.moveExecutor = moveExecutor;
    this.container = null;
    this.isVisible = true;
    this.lastAnalysis = null;
    this.lastMoveCount = 0;
    this.prevMoveCount = -1;
    this.isAutoAnalyzing = false;
    this.isAutoExecuting = false;
    this.pieceNameObserver = null;

    this.settings = {
      autoPlayEnabled: false,
      autoAnalyzeEnabled: true,
      highlightEnabled: true,
      showPieceNames: true,
      depth: 15,
      autoDepthEnabled: true,
      variants: 5, // Cần nhiều variants để chọn nước lỗi
      apiType: 'stockfish',
      autoQueueEnabled: false,
      autoQueueMode: 'same',
      humanErrorRate: 10 // 0-20%, tỉ lệ đi nước không tốt nhất
    };

    this.gameState = {
      isInGame: false,
      myColor: 'white',
      isMyTurn: true,
      myName: '---',
      opponentName: '---',
      myElo: '---',
      opponentElo: '---',
      moves: [],
      openingName: '' // Tên khai cuộc
    };

    // Lưu các variants từ API để chọn nước lỗi
    this.alternativeMoves = [];

    this.tempoTracker = window.OpponentTempoTracker ? new window.OpponentTempoTracker() : null;
    this.autoQueueManager = window.AutoQueueManager ? new window.AutoQueueManager(this) : null;
    this.lastUrl = location.href;
  }

  async init() {
    console.log('[OverlayUI] Initializing...');
    await this._loadSettings();
    this._createOverlay();
    this._setupEventListeners();
    document.body.appendChild(this.container);
    this._startGameMonitor();
    this._startUrlMonitor(); // Theo dõi URL changes
    if (this.settings.showPieceNames) this._showPieceNames();
    this.autoQueueManager?.startMonitoring();
    console.log('[OverlayUI] Ready!');
  }

  async _loadSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, r => {
        if (r?.success) Object.assign(this.settings, r.settings);
        resolve();
      });
    });
  }

  _createOverlay() {
    this.container = document.createElement('div');
    this.container.id = 'chess-ext-overlay';
    this.container.innerHTML = this._getHTML();
  }

  _getHTML() {
    return `
      <style>${this._getCSS()}</style>
      
      <!-- Game Info -->
      <div class="ext-panel" id="panel-info">
        <div class="ext-header">
          <span class="ext-title"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 22H5v-2h14v2M13 2c-1.25 0-2.42.62-3.11 1.66L7 8l2 2 2.06-2.75.94.75-2.38 3.88C9.25 12.56 9 13.26 9 14v6h6v-6c0-.74-.25-1.44-.62-2.12L12 8l.94-.75L15 10l2-2-2.89-4.34C13.42 2.62 12.25 2 11 2h2z"/></svg>VÁN ĐẤU</span>
          <button class="ext-toggle">−</button>
        </div>
        <div class="ext-body">
          <div class="game-status not-in-game" id="game-status"><svg class="status-icon-svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Chờ ván đấu...</span></div>
          <div class="game-mode-row" id="game-mode-info" style="display:none"><svg class="row-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Thời gian:</span><span class="game-mode-value" id="game-mode-value">--</span></div>
          <div class="game-mode-row" id="opening-info" style="display:none"><svg class="row-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2z"/></svg><span>Khai cuộc:</span><span class="opening-name" id="opening-name">--</span></div>
          <div class="game-info-row">
            <div class="color-dot black" id="opponent-color"></div>
            <div class="player-info"><div class="player-name" id="opponent-name">Đối thủ</div><div class="player-elo" id="opponent-elo">---</div></div>
            <span class="opponent-badge">ĐỐI THỦ</span>
          </div>
          <div class="game-info-row">
            <div class="color-dot white" id="my-color"></div>
            <div class="player-info"><div class="player-name" id="my-name">Bạn</div><div class="player-elo" id="my-elo">---</div></div>
            <span class="turn-badge my-turn" id="turn-badge">LƯỢT BẠN</span>
          </div>
        </div>
      </div>
      
      <!-- Analysis -->
      <div class="ext-panel" id="panel-analysis">
        <div class="ext-header">
          <span class="ext-title"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 14h4v7H3v-7zM10 10h4v11h-4V10zM17 3h4v18h-4V3z"/></svg>PHÂN TÍCH</span>
          <button class="ext-toggle">−</button>
        </div>
        <div class="ext-body">
          <div class="eval-display">
            <div class="eval-bar"><div class="eval-fill" id="eval-fill" style="height:50%"></div></div>
            <div class="eval-text">
              <div class="eval-value neutral" id="eval-value">0.0</div>
              <div class="win-percent" id="win-percent">Cơ hội thắng: 50%</div>
            </div>
          </div>
          <div class="recommend-box">
            <div class="recommend-header"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="12" cy="12" r="5"/></svg>NƯỚC ĐI ĐỀ XUẤT</div>
            <div class="recommend-content">
              <div class="move-visual">
                <div class="move-piece" id="move-piece">♞</div>
                <div class="move-squares">
                  <span class="from-square" id="from-square">--</span>
                  <span class="move-arrow">➜</span>
                  <span class="to-square" id="to-square">--</span>
                </div>
              </div>
              <div class="move-explain" id="move-explain">Nhấn phân tích để xem gợi ý</div>
            </div>
          </div>
          <div class="next-moves-box">
            <div class="next-moves-header">DỰ ĐOÁN TIẾP</div>
            <div class="next-moves-list" id="next-moves">Chờ phân tích...</div>
          </div>
          <button class="btn-analyze" id="btn-analyze"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>Phân tích ngay</button>
          <button class="btn-force" id="btn-force"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>Force Play</button>
        </div>
      </div>
      
      <!-- Settings -->
      <div class="ext-panel" id="panel-control">
        <div class="ext-header">
          <span class="ext-title"><svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>CÀI ĐẶT</span>
          <button class="ext-toggle">−</button>
        </div>
        <div class="ext-body">
          <div class="control-row"><span class="control-label">Tự phân tích</span><label class="toggle-switch"><input type="checkbox" id="toggle-auto-analyze" ${this.settings.autoAnalyzeEnabled ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
          <div class="control-row"><span class="control-label">Auto-play</span><label class="toggle-switch"><input type="checkbox" id="toggle-autoplay" ${this.settings.autoPlayEnabled ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
          <div class="control-row"><span class="control-label">Auto New Game</span><label class="toggle-switch"><input type="checkbox" id="toggle-autoqueue" ${this.settings.autoQueueEnabled ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
          <div class="control-row" id="autoqueue-mode-row" style="${this.settings.autoQueueEnabled ? '' : 'display:none'}">
             <select id="select-autoqueue-mode" class="ext-select">
                <option value="same" ${this.settings.autoQueueMode === 'same' ? 'selected' : ''}>Chế độ cũ</option>
                <option value="bullet" ${this.settings.autoQueueMode === 'bullet' ? 'selected' : ''}>Bullet (1m)</option>
                <option value="blitz" ${this.settings.autoQueueMode === 'blitz' ? 'selected' : ''}>Blitz (3m)</option>
                <option value="rapid" ${this.settings.autoQueueMode === 'rapid' ? 'selected' : ''}>Rapid (10m)</option>
             </select>
          </div>
          <div class="control-row"><span class="control-label">Auto Elo Depth</span><label class="toggle-switch"><input type="checkbox" id="toggle-auto-depth" ${this.settings.autoDepthEnabled ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
          <div class="control-row" id="depth-control-row" style="${this.settings.autoDepthEnabled ? 'opacity:0.5;pointer-events:none' : ''}">
            <span class="control-label">Độ sâu: <b id="depth-val">${this.settings.depth}</b></span>
            <input type="range" class="mini-slider" id="slider-depth" min="1" max="18" value="${this.settings.depth}">
          </div>
          <div class="control-row">
            <span class="control-label">Lỗi người: <b id="error-val">${this.settings.humanErrorRate}%</b></span>
            <input type="range" class="mini-slider error-slider" id="slider-error" min="0" max="20" value="${this.settings.humanErrorRate}">
          </div>
          <button class="btn-save" id="btn-save">Lưu Cài Đặt</button>
        </div>
        <div class="status-bar">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Đang kết nối Chess API...</span>
        </div>
      </div>
    `;
  }

  _getCSS() {
    return `
      #chess-ext-overlay { --cc-bg:#312e2b; --cc-bg-dark:#272522; --cc-bg-darker:#21201d; --cc-border:#454341; --cc-text:#fff; --cc-text-dim:#b0ada9; --cc-text-muted:#9e9b97; --cc-green:#81b64c; --cc-green-dark:#629a24; --cc-orange:#fa9c1b; --cc-red:#e04040; --cc-purple:#b794f4; position:fixed; top:10px; right:10px; z-index:999999; font-family:'Segoe UI',system-ui,sans-serif; font-size:13px; color:var(--cc-text); pointer-events:none; }
      #chess-ext-overlay * { box-sizing:border-box; }
      .ext-panel { background:linear-gradient(180deg, var(--cc-bg) 0%, #2a2723 100%); border:1px solid var(--cc-border); border-radius:8px; margin-bottom:6px; pointer-events:auto; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.5); width:220px; transition:transform 0.15s, box-shadow 0.15s; }
      .ext-panel:hover { box-shadow:0 6px 20px rgba(0,0,0,0.6); }
      .ext-header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:linear-gradient(180deg, var(--cc-bg-dark) 0%, #232220 100%); cursor:pointer; user-select:none; border-bottom:1px solid var(--cc-border); }
      .ext-header:hover { background:linear-gradient(180deg, #2a2826 0%, #1f1e1c 100%); }
      .ext-title { font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; display:flex; align-items:center; gap:6px; color:var(--cc-text); }
      .ext-title svg { width:14px; height:14px; fill:var(--cc-green); }
      .ext-toggle { background:var(--cc-bg); border:1px solid var(--cc-border); color:var(--cc-text-dim); cursor:pointer; font-size:12px; font-weight:700; width:22px; height:22px; border-radius:4px; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
      .ext-toggle:hover { background:var(--cc-green); color:#fff; border-color:var(--cc-green); }
      .ext-body { padding:12px; }
      .ext-panel.collapsed .ext-body { display:none; }
      .game-status { display:flex; align-items:center; gap:8px; padding:8px; border-radius:4px; font-size:11px; font-weight:600; margin-bottom:8px; }
      .game-status.in-game { background:rgba(129,182,76,0.15); border:1px solid var(--cc-green); color:var(--cc-green); }
      .game-status.not-in-game { background:var(--cc-bg-dark); border:1px solid var(--cc-border); color:var(--cc-text-dim); }
      .status-icon-svg { width:16px; height:16px; flex-shrink:0; }
      .row-icon { width:12px; height:12px; flex-shrink:0; fill:var(--cc-text-muted); margin-right:2px; }
      .game-mode-row .row-icon { fill:var(--cc-orange); }
      .game-info-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--cc-border); }
      .game-info-row:last-child { border:none; }
      .color-dot { width:20px; height:20px; border-radius:3px; border:2px solid var(--cc-border); }
      .color-dot.white { background:#fff; }
      .color-dot.black { background:#000; }
      .player-info { flex:1; min-width:0; }
      .player-name { font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .player-elo { font-size:10px; color:var(--cc-text-muted); }
      .turn-badge { padding:3px 8px; border-radius:3px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; display:flex; align-items:center; gap:4px; }
      .turn-badge.my-turn { background:var(--cc-green); color:#fff; animation:turnPulse 2s ease-in-out infinite; }
      .turn-badge.their-turn { background:var(--cc-bg-darker); color:var(--cc-text-muted); border:1px solid var(--cc-border); }
      @keyframes turnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(129,182,76,0.4)} 50%{box-shadow:0 0 0 4px rgba(129,182,76,0)} }
      .opponent-badge { padding:3px 6px; border-radius:3px; font-size:8px; font-weight:600; background:var(--cc-bg-darker); color:var(--cc-text-muted); border:1px solid var(--cc-border); }
      .eval-display { display:flex; align-items:center; gap:10px; padding:8px; background:var(--cc-bg-dark); border-radius:4px; margin-bottom:8px; }
      .eval-bar { width:8px; height:40px; background:var(--cc-bg-darker); border-radius:4px; position:relative; overflow:hidden; border:1px solid var(--cc-border); }
      .eval-fill { position:absolute; bottom:0; left:0; right:0; background:#fff; transition:height 0.4s ease; }
      .eval-text { flex:1; }
      .eval-value { font-size:22px; font-weight:700; line-height:1.1; }
      .eval-value.positive { color:#fff; }
      .eval-value.negative { color:var(--cc-text-muted); }
      .eval-value.neutral { color:var(--cc-text-dim); }
      .win-percent { font-size:10px; color:var(--cc-text-muted); margin-top:2px; }
      .win-chance-row,.skill-row { display:flex; align-items:center; gap:5px; padding:3px 0; }
      .win-chance-row { font-size:11px; font-weight:600; }
      .win-chance-row svg { fill:var(--cc-green); flex-shrink:0; }
      .win-value { color:var(--cc-green); font-size:12px; font-weight:700; }
      .win-label { color:var(--cc-text-muted); font-size:10px; }
      .skill-row { font-size:9px; color:var(--cc-text-muted); }
      .skill-row svg { fill:var(--cc-text-muted); flex-shrink:0; }
      .skill-name { font-weight:600; color:var(--cc-text-dim); }
      .skill-elo { color:var(--cc-text-muted); margin-left:auto; }
      .recommend-box { background:linear-gradient(135deg,rgba(129,182,76,0.12) 0%,rgba(129,182,76,0.04) 100%); border:1px solid var(--cc-green); border-radius:4px; padding:10px; margin-bottom:8px; }
      .recommend-header { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--cc-green); margin-bottom:6px; display:flex; align-items:center; gap:4px; }
      .recommend-header svg { width:12px; height:12px; }
      .recommend-content { text-align:center; }
      .move-visual { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:4px; }
      .move-piece { font-size:28px; line-height:1; }
      .move-squares { display:flex; align-items:center; gap:6px; font-size:14px; font-weight:700; }
      .from-square { background:rgba(250,156,27,0.2); color:var(--cc-orange); padding:4px 8px; border-radius:3px; font-family:monospace; border:1px solid var(--cc-orange); }
      .move-arrow { color:var(--cc-text-muted); font-size:16px; }
      .to-square { background:rgba(129,182,76,0.2); color:var(--cc-green); padding:4px 8px; border-radius:3px; font-family:monospace; border:1px solid var(--cc-green); }
      .move-explain { font-size:10px; color:var(--cc-text-muted); margin-top:4px; }
      .next-moves-box { background:var(--cc-bg-dark); border-radius:4px; padding:8px; margin-bottom:8px; }
      .next-moves-header { font-size:9px; color:var(--cc-text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px; }
      .next-moves-list { font-size:10px; color:var(--cc-text-dim); font-family:monospace; line-height:1.6; }
      .next-move-item { display:inline-block; background:var(--cc-bg); border:1px solid var(--cc-border); padding:2px 5px; border-radius:2px; margin:2px; }
      .game-mode-row { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cc-text-dim); margin-bottom:8px; padding:0 4px; }
      .game-mode-value { color:var(--cc-orange); font-weight:700; margin-left:auto; }
      .opening-name { color:#b794f4; font-weight:600; margin-left:auto; font-size:10px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #opening-info .row-icon { fill:#b794f4; }
      .error-slider::-webkit-slider-thumb { background:var(--cc-orange) !important; }
      .btn-analyze { width:100%; padding:10px; background:var(--cc-green); color:#fff; border:none; border-radius:4px; font-weight:700; font-size:12px; cursor:pointer; transition:all 0.15s; display:flex; align-items:center; justify-content:center; gap:6px; }
      .btn-analyze:hover { background:var(--cc-green-dark); }
      .btn-analyze:active { transform:scale(0.98); }
      .btn-analyze.analyzing { background:var(--cc-text-muted); cursor:wait; }
      .btn-force { width:100%; padding:10px; background:var(--cc-orange); color:#fff; border:none; border-radius:4px; font-weight:700; font-size:12px; cursor:pointer; margin-top:6px; display:flex; align-items:center; justify-content:center; gap:6px; }
      .btn-force:hover { background:#e08a14; }
      .btn-save { width:100%; padding:8px; background:var(--cc-bg-darker); color:var(--cc-text); border:1px solid var(--cc-border); border-radius:4px; font-weight:600; font-size:11px; cursor:pointer; margin-top:8px; transition:all 0.2s; }
      .btn-save:hover { background:var(--cc-border); }
      .btn-save.saved { background:var(--cc-green); color:#fff; border-color:var(--cc-green); }
      .control-row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--cc-border); }
      .control-row:last-of-type { border:none; }
      .control-label { font-size:11px; color:var(--cc-text-dim); }
      .toggle-switch { position:relative; width:36px; height:18px; }
      .toggle-switch input { opacity:0; width:0; height:0; }
      .toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:var(--cc-bg-darker); border:1px solid var(--cc-border); border-radius:18px; transition:0.2s; }
      .toggle-slider::before { content:""; position:absolute; height:12px; width:12px; left:2px; bottom:2px; background:var(--cc-text-muted); border-radius:50%; transition:0.2s; }
      input:checked + .toggle-slider { background:var(--cc-green); border-color:var(--cc-green); }
      input:checked + .toggle-slider::before { background:#fff; transform:translateX(18px); }
      .mini-slider { width:80px; height:4px; appearance:none; background:var(--cc-bg-darker); border-radius:2px; outline:none; }
      .mini-slider::-webkit-slider-thumb { appearance:none; width:12px; height:12px; background:var(--cc-green); border-radius:50%; cursor:pointer; border:2px solid #fff; }
      .ext-select { background:var(--cc-bg-darker); color:var(--cc-text); border:1px solid var(--cc-border); border-radius:4px; font-size:10px; padding:2px 4px; width:100px; outline:none; }
      .status-bar { display:flex; align-items:center; gap:6px; padding:6px 10px; background:var(--cc-bg-dark); border-top:1px solid var(--cc-border); font-size:10px; color:var(--cc-text-muted); }
      .status-dot { width:6px; height:6px; border-radius:50%; background:var(--cc-green); }
      .status-dot.disconnected { background:var(--cc-red); }
      .status-dot.analyzing { background:var(--cc-orange); animation:pulse 1s infinite; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      .mate-alert { color:#ef4444 !important; font-weight:700; animation:mateFlash 0.5s ease-in-out infinite alternate; }
      @keyframes mateFlash { from{opacity:0.7} to{opacity:1} }
      .piece-name-label { position:absolute; background:var(--cc-bg); color:var(--cc-text); font-size:9px; font-weight:700; padding:2px 4px; border-radius:2px; pointer-events:none; z-index:100; border:1px solid var(--cc-border); }
      .piece-name-label.white-piece { background:#fff; color:#312e2b; border-color:#d1d1d1; }
      .piece-name-label.black-piece { background:#312e2b; color:#fff; }
    `;
  }

  _setupEventListeners() {
    const $ = sel => this.container.querySelector(sel);

    // Panel toggles
    this.container.querySelectorAll('.ext-header').forEach(h => {
      h.addEventListener('click', e => {
        if (!e.target.classList.contains('ext-toggle')) return;
        const panel = h.closest('.ext-panel');
        panel.classList.toggle('collapsed');
        e.target.textContent = panel.classList.contains('collapsed') ? '+' : '−';
      });
    });

    $('#btn-analyze').addEventListener('click', () => this.requestAnalysis());
    $('#btn-force')?.addEventListener('click', () => this.lastAnalysis && this._executeForcePlay());

    $('#toggle-autoplay').addEventListener('change', e => {
      this.settings.autoPlayEnabled = e.target.checked;
      this._saveSettings();
    });

    $('#toggle-auto-analyze').addEventListener('change', e => {
      this.settings.autoAnalyzeEnabled = e.target.checked;
      this._saveSettings();
    });

    $('#toggle-autoqueue').addEventListener('change', e => {
      this.settings.autoQueueEnabled = e.target.checked;
      $('#autoqueue-mode-row').style.display = e.target.checked ? 'flex' : 'none';
      this._saveSettings();
    });

    $('#select-autoqueue-mode').addEventListener('change', e => {
      this.settings.autoQueueMode = e.target.value;
      this._saveSettings();
    });

    $('#toggle-auto-depth').addEventListener('change', e => {
      this.settings.autoDepthEnabled = e.target.checked;
      const depthRow = $('#depth-control-row');
      depthRow.style.opacity = e.target.checked ? '0.5' : '1';
      depthRow.style.pointerEvents = e.target.checked ? 'none' : 'auto';
      if (e.target.checked) this._updateAutoDepth();
      this._saveSettings();
    });

    $('#slider-depth').addEventListener('input', e => {
      this.settings.depth = parseInt(e.target.value);
      $('#depth-val').textContent = this.settings.depth;
      this._saveSettings();
    });

    $('#slider-error').addEventListener('input', e => {
      this.settings.humanErrorRate = parseInt(e.target.value);
      $('#error-val').textContent = `${this.settings.humanErrorRate}%`;
      this._saveSettings();
    });

    $('#btn-save').addEventListener('click', () => this._saveSettingsWithFeedback());
  }

  _startGameMonitor() {
    this._updateGameState();
    setInterval(() => this._updateGameState(), 500);
  }

  _startUrlMonitor() {
    console.log('[OverlayUI] Starting URL/Game monitor...');

    // 1. Theo dõi URL thay đổi (interval)
    setInterval(() => {
      if (location.href !== this.lastUrl) {
        console.log('[OverlayUI] URL changed:', this.lastUrl, '->', location.href);
        this._handleGameChange();
      }
    }, 200);

    // 2. Lắng nghe popstate event (back/forward navigation)
    window.addEventListener('popstate', () => {
      console.log('[OverlayUI] Popstate event - navigation detected');
      this._handleGameChange();
    });

    // 3. Lắng nghe hashchange
    window.addEventListener('hashchange', () => {
      console.log('[OverlayUI] Hashchange event');
      this._handleGameChange();
    });

    // 4. Override pushState và replaceState để catch SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      console.log('[OverlayUI] pushState detected');
      self._handleGameChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      console.log('[OverlayUI] replaceState detected');
      setTimeout(() => self._handleGameChange(), 100);
    };

    // 5. Theo dõi thay đổi player name (cho biết ván mới bắt đầu)
    let lastOpponentName = '';
    setInterval(() => {
      const oppName = document.querySelector('#board-layout-player-top .cc-user-username-component')?.textContent?.trim();
      if (oppName && oppName !== lastOpponentName && lastOpponentName !== '') {
        console.log('[OverlayUI] Opponent changed:', lastOpponentName, '->', oppName);
        this._handleGameChange();
      }
      lastOpponentName = oppName || '';
    }, 500);
  }

  _handleGameChange() {
    console.log('[OverlayUI] Game change detected - reinitializing...');
    this.lastUrl = location.href;

    // Reset tất cả state
    this.gameState.isInGame = false;
    this.lastMoveCount = -1;
    this.prevMoveCount = -1;
    this.lastAnalysis = null;
    this.alternativeMoves = [];
    this.tempoTracker?.reset();
    this.clearHighlights();

    // Force update ngay và sau 500ms
    this._updateGameState();
    setTimeout(() => this._updateGameState(), 500);
    setTimeout(() => this._updateGameState(), 1000);
  }

  _updateGameState() {
    try {
      // === SIMPLE BUT ROBUST GAME DETECTION === 
      const board = document.querySelector('wc-chess-board, chess-board');
      const pieces = document.querySelectorAll('.piece');

      // Check các indicators - bất kỳ cái nào có = đang chơi
      const hasResign = !!document.querySelector('.resign-button-component, [data-cy="resign-button"]');
      const hasClock = !!document.querySelector('.clock-component');
      const hasMoveList = !!document.querySelector('wc-simple-move-list');
      const hasGameOver = !!document.querySelector('.game-over-modal-content, [class*="game-over-header"]');

      // inGame = có board + pieces + (resign hoặc clock hoặc movelist) + không game-over
      const inGame = !!board && pieces.length >= 10 && (hasResign || hasClock || hasMoveList) && !hasGameOver;

      // Debug log khi có thay đổi
      if (inGame !== this.gameState.isInGame) {
        console.log(`[OverlayUI] Game state changed: ${inGame ? 'IN GAME' : 'NOT IN GAME'}`);
        console.log(`[OverlayUI] Detection: board=${!!board}, pieces=${pieces.length}, resign=${hasResign}, clock=${hasClock}, moveList=${hasMoveList}, gameOver=${hasGameOver}`);
      }

      if (inGame && !this.gameState.isInGame) {
        this.lastMoveCount = -1;
        this.prevMoveCount = -1;
        this.tempoTracker?.reset();
        console.log('[OverlayUI] Detected new game started!');
      } else if (!inGame && this.gameState.isInGame) {
        console.log('[OverlayUI] Game ended - Auto Queue checking...');
      }

      this.gameState.isInGame = inGame;
      if (this.settings.autoDepthEnabled && inGame) this._updateAutoDepth();

      const statusEl = this.container.querySelector('#game-status');
      statusEl.innerHTML = inGame
        ? '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>Đang trong trận</span>'
        : '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Chờ ván đấu...</span>';
      statusEl.className = `game-status ${inGame ? 'in-game' : 'not-in-game'}`;

      // Update Game Mode Info
      if (inGame) {
        const time = this.boardDetector?.getGameTimeLimit() || 0;
        const type = this.boardDetector?.getGameTimeType() || '';
        if (time > 0) {
          const tStr = time < 60 ? `${time}s` : `${Math.floor(time / 60)}p`;
          const tyStr = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown';
          this.container.querySelector('#game-mode-info').style.display = 'flex';
          this.container.querySelector('#game-mode-value').textContent = `${tyStr} (${tStr})`;
        }

        // === OPENING NAME DETECTION ===
        this._detectOpeningName();
      } else {
        this.container.querySelector('#game-mode-info').style.display = 'none';
        this.container.querySelector('#opening-info').style.display = 'none';
      }


      // Reuse board from above - check for flipped
      this.gameState.myColor = board?.classList.contains('flipped') ? 'black' : 'white';

      this._extractPlayerInfo();

      const moves = this._parseMoveList();
      this.gameState.moves = moves;
      const totalMoves = moves.length;

      if (this.prevMoveCount !== -1 && totalMoves !== this.prevMoveCount) this.clearHighlights();
      this.prevMoveCount = totalMoves;

      const isWhiteTurn = totalMoves % 2 === 0;
      this.gameState.isMyTurn = (this.gameState.myColor === 'white') === isWhiteTurn;

      // Auto-analysis
      if (this.settings.autoAnalyzeEnabled && inGame && this.gameState.isMyTurn &&
        totalMoves !== this.lastMoveCount && !this.isAutoAnalyzing) {
        this.lastMoveCount = totalMoves;
        this.isAutoAnalyzing = true;
        this.tempoTracker?.recordOpponentMove();
        setTimeout(() => { this.requestAnalysis(); this.isAutoAnalyzing = false; }, 300);
      } else if (totalMoves !== this.lastMoveCount) {
        this.lastMoveCount = totalMoves;
      }

      this._updatePlayerInfoUI();
    } catch (e) {
      console.error('[OverlayUI] Error:', e);
    }
  }

  _extractPlayerInfo() {
    const top = document.querySelector('.board-layout-top');
    const bottom = document.querySelector('.board-layout-bottom');

    if (top) {
      this.gameState.opponentName = top.querySelector('[class*="username"]')?.textContent?.trim() || '---';
      this.gameState.opponentElo = top.querySelector('[class*="rating"]')?.textContent?.trim() || '';
    }
    if (bottom) {
      this.gameState.myName = bottom.querySelector('[class*="username"]')?.textContent?.trim() || '---';
      this.gameState.myElo = bottom.querySelector('[class*="rating"]')?.textContent?.trim() || '';
    }
  }

  _parseMoveList() {
    const moves = [];
    document.querySelectorAll('wc-simple-move-list .node.main-line-ply, .move-list .node')
      .forEach(n => { const t = n.textContent?.trim(); if (t && t !== '...') moves.push(t); });
    return moves;
  }

  _updatePlayerInfoUI() {
    const $ = sel => this.container.querySelector(sel);
    $('#opponent-name').textContent = this.gameState.opponentName;
    $('#opponent-elo').textContent = this.gameState.opponentElo;
    $('#opponent-color').className = `color-dot ${this.gameState.myColor === 'white' ? 'black' : 'white'}`;
    $('#my-name').textContent = this.gameState.myName;
    $('#my-elo').textContent = this.gameState.myElo;
    $('#my-color').className = `color-dot ${this.gameState.myColor}`;

    const badge = $('#turn-badge');
    badge.textContent = this.gameState.isMyTurn ? 'LƯỢT BẠN' : 'LƯỢT ĐỊCH';
    badge.className = `turn-badge ${this.gameState.isMyTurn ? 'my-turn' : 'their-turn'}`;
  }

  requestAnalysis() {
    const fen = this._generateFEN();
    if (!fen || fen.startsWith('8/8/8/8')) {
      console.warn('[OverlayUI] Invalid FEN');
      return;
    }
    console.log('[OverlayUI] Analyzing:', fen);
    this.showThinking();
    this.apiClient.analyzePosition(fen, { depth: this.settings.depth, mode: 'bestmove' });
  }

  _generateFEN() {
    const pieces = document.querySelectorAll('.piece');
    if (!pieces.length) return null;

    const board = Array(8).fill(null).map(() => Array(8).fill(''));

    pieces.forEach(p => {
      let type = null, pos = null;
      for (const cls of p.classList) {
        if (cls.length === 2 && 'wb'.includes(cls[0]) && 'kqrbnp'.includes(cls[1])) type = cls;
        if (cls.startsWith('square-') && cls.length === 9) pos = cls.slice(7);
      }
      if (type && pos?.length === 2) {
        const file = parseInt(pos[0]) - 1, rank = parseInt(pos[1]) - 1;
        const char = type[0] === 'w' ? type[1].toUpperCase() : type[1];
        if (file >= 0 && file < 8 && rank >= 0 && rank < 8) board[7 - rank][file] = char;
      }
    });

    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) { if (empty) { fen += empty; empty = 0; } fen += board[r][c]; }
        else empty++;
      }
      if (empty) fen += empty;
      if (r < 7) fen += '/';
    }

    const moves = this._parseMoveList();
    const turn = moves.length % 2 === 0 ? 'w' : 'b';

    let castling = '';
    if (board[7][4] === 'K') { if (board[7][7] === 'R') castling += 'K'; if (board[7][0] === 'R') castling += 'Q'; }
    if (board[0][4] === 'k') { if (board[0][7] === 'r') castling += 'k'; if (board[0][0] === 'r') castling += 'q'; }

    return `${fen} ${turn} ${castling || '-'} - 0 ${Math.floor(moves.length / 2) + 1}`;
  }

  showThinking() {
    const btn = this.container.querySelector('#btn-analyze');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="animation:spin 1s linear infinite"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Đang phân tích...';
    btn.classList.add('analyzing');
    this.container.querySelector('#status-dot').classList.add('analyzing');
  }

  hideThinking() {
    const btn = this.container.querySelector('#btn-analyze');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>Phân tích ngay';
    btn.classList.remove('analyzing');
    this.container.querySelector('#status-dot').classList.remove('analyzing');
  }

  updateAnalysis(analysis) {
    if (!analysis) return;
    this.lastAnalysis = analysis;

    // Lưu alternative moves cho Intentional Mistake System
    if (analysis.move) {
      // Reset và thêm best move
      this.alternativeMoves = [analysis.move];

      // Thêm các moves từ continuation nếu có (engine thường trả về multi-pv)
      if (analysis.continuation) {
        const contMoves = analysis.continuation.split(' ').filter(m => m.length >= 4).slice(0, 3);
        this.alternativeMoves = [...new Set([analysis.move, ...contMoves])];
      }
    }

    const $ = sel => this.container.querySelector(sel);
    const ev = analysis.eval || 0;
    const evalEl = $('#eval-value');
    evalEl.textContent = ev >= 0 ? `+${ev.toFixed(1)}` : ev.toFixed(1);
    evalEl.className = `eval-value ${ev > 0.3 ? 'positive' : ev < -0.3 ? 'negative' : 'neutral'}`;
    $('#eval-fill').style.height = `${Math.max(5, Math.min(95, 50 + ev * 10))}%`;

    const skill = this._getSkillLevel(analysis.depth || 12);
    $('#win-percent').innerHTML = `
      <div class="win-chance-row"><svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="12" cy="12" r="5"/></svg>
      <span class="win-value">${(analysis.winChance || 50).toFixed(0)}%</span><span class="win-label">thắng</span></div>
      <div class="skill-row"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>
      <span class="skill-name">${skill.name}</span><span class="skill-elo">~${skill.elo} ELO</span></div>`;

    if (analysis.move?.length >= 4) {
      const from = analysis.move.slice(0, 2), to = analysis.move.slice(2, 4);
      const piece = this._getPieceInfoAt(from);
      $('#from-square').textContent = from.toUpperCase();
      $('#to-square').textContent = to.toUpperCase();
      $('#move-piece').textContent = piece.symbol || '♟';

      let explain = analysis.mate
        ? `🎯 CHIẾU HẾT sau ${Math.abs(analysis.mate)} nước!`
        : `${piece.name} ${analysis.san || `${from}→${to}`}`;
      if (analysis.captured) explain += ` ⚔️ Ăn quân`;
      $('#move-explain').textContent = explain;
      $('#move-explain').classList.toggle('mate-alert', !!analysis.mate);
    }

    if (analysis.continuation) {
      const moves = analysis.continuation.split(' ').filter(m => m.length >= 4).slice(0, 6);
      $('#next-moves').innerHTML = moves.map((m, i) => {
        const prefix = i % 2 === 0 ? `<b>${Math.floor(i / 2) + 1}.</b>` : '';
        return `<span class="next-move-item">${prefix} ${m.slice(0, 2).toUpperCase()}→${m.slice(2, 4).toUpperCase()}</span>`;
      }).join(' ');
    }

    if (this.settings.autoPlayEnabled && this.gameState.isMyTurn && analysis.move) {
      this._autoExecuteMove(analysis);
    }
  }

  async _autoExecuteMove(analysis) {
    if (!analysis?.move || this.isAutoExecuting) return;
    this.isAutoExecuting = true;

    // === INTENTIONAL MISTAKE SYSTEM ===
    let selectedMove = analysis.move;
    const errorRate = this.settings.humanErrorRate || 0;

    if (errorRate > 0 && this.alternativeMoves.length > 1) {
      const roll = Math.random() * 100;
      if (roll < errorRate) {
        // Chọn nước thứ 2 hoặc 3 thay vì nước tốt nhất
        const alternatives = this.alternativeMoves.filter(m => m !== analysis.move);
        if (alternatives.length > 0) {
          const idx = Math.floor(Math.random() * Math.min(2, alternatives.length));
          selectedMove = alternatives[idx];
          console.log(`[AutoPlay] 🎭 INTENTIONAL MISTAKE: ${analysis.move} → ${selectedMove}`);
        }
      }
    }

    const move = {
      from: selectedMove.slice(0, 2),
      to: selectedMove.slice(2, 4),
      promotion: selectedMove.length > 4 ? selectedMove[4] : null
    };

    let delay = 1000;
    if (this.moveExecutor?.humanBehavior) {
      const remainingTime = this._getRemainingClockTime();
      const base = this.moveExecutor.humanBehavior.calculateThinkTime({
        eval: analysis.eval || 0,
        moveNumber: this.gameState.moves.length + 1,
        isCapture: !!analysis.captured,
        isCheck: analysis.san?.includes('+'),
        positionComplexity: Math.min(1, Math.abs(analysis.eval || 0) / 5),
        timeLimit: this.boardDetector?.getGameTimeLimit() || 600,
        timeType: this.boardDetector?.getGameTimeType() || 'rapid',
        remainingTime: remainingTime
      });
      delay = this.tempoTracker?.opponentMoves.length >= 2
        ? this.tempoTracker.adjustBotThinkTime(base, this.boardDetector?.getGameTimeType()) : base;
    }

    console.log(`[AutoPlay] Thinking ${(delay / 1000).toFixed(1)}s`);
    await this._sleep(delay);

    if (!this.gameState.isMyTurn) { this.isAutoExecuting = false; return; }

    const success = await this.moveExecutor?.executeMove(move);
    if (success) this.clearHighlights();
    this.isAutoExecuting = false;
  }

  _executeForcePlay() {
    if (!this.lastAnalysis?.move) return;
    const move = { from: this.lastAnalysis.from, to: this.lastAnalysis.to, promotion: this.lastAnalysis.promotion };
    this.moveExecutor?.executeMove(move).then(s => s && this.clearHighlights());
  }

  showProgressiveAnalysis(a) {
    if (a.eval === undefined) return;
    const ev = this.container.querySelector('#eval-value');
    ev.textContent = `${a.eval >= 0 ? '+' : ''}${a.eval.toFixed(1)}...`;
    ev.style.opacity = '0.7';
    this.container.querySelector('#status-text').textContent = `Đang tính... depth ${a.depth || '?'}`;
  }

  highlightBestMove(a) {
    if (!a.from || !a.to) return;
    this.clearHighlights();
    const fromEl = this._getSquareOverlay(a.from);
    const toEl = this._getSquareOverlay(a.to);
    fromEl?.classList.add('ext-highlight-from');
    toEl?.classList.add('ext-highlight-to');
    this._drawArrow(fromEl, toEl);
  }

  clearHighlights() {
    document.querySelectorAll('.ext-virtual-highlight').forEach(el => el.remove());
    document.querySelectorAll('.ext-highlight-from, .ext-highlight-to').forEach(el => {
      el.classList.remove('ext-highlight-from', 'ext-highlight-to');
    });
    document.getElementById('chess-ext-arrow-layer')?.remove();
  }

  _getSquareOverlay(sq) {
    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board || !sq) return null;

    let el = board.querySelector(`.ext-virtual-highlight[data-sq="${sq}"]`);
    if (el) return el;

    const file = sq.charCodeAt(0) - 97, rank = parseInt(sq[1]);
    const flipped = board.classList.contains('flipped');
    const fIdx = flipped ? 7 - file : file;
    const rIdx = flipped ? rank - 1 : 8 - rank;

    el = document.createElement('div');
    el.className = 'ext-virtual-highlight';
    el.dataset.sq = sq;
    el.style.cssText = `position:absolute;width:12.5%;height:12.5%;left:${fIdx * 12.5}%;top:${rIdx * 12.5}%;z-index:1;pointer-events:none;`;
    board.appendChild(el);
    return el;
  }

  _drawArrow(from, to) {
    if (!from || !to) return;
    document.getElementById('chess-ext-arrow-layer')?.remove();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'chess-ext-arrow-layer';
    svg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;';

    const f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
    const x1 = f.left + f.width / 2, y1 = f.top + f.height / 2;
    const x2 = t.left + t.width / 2, y2 = t.top + t.height / 2;
    const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    const ratio = (len - 15) / len;
    const ex = x1 + dx * ratio, ey = y1 + dy * ratio;

    svg.innerHTML = `
      <defs><filter id="ext-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <marker id="ext-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#81b64c"/></marker></defs>
      <line x1="${x1 + 2}" y1="${y1 + 2}" x2="${ex + 2}" y2="${ey + 2}" stroke="rgba(0,0,0,0.3)" stroke-width="10" stroke-linecap="round"/>
      <line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="#81b64c" stroke-width="8" stroke-linecap="round" marker-end="url(#ext-arrowhead)" filter="url(#ext-glow)"/>
      <circle cx="${x1}" cy="${y1}" r="12" fill="rgba(250,156,27,0.4)" stroke="#fa9c1b" stroke-width="3"/>
      <circle cx="${x2}" cy="${y2}" r="12" fill="rgba(129,182,76,0.4)" stroke="#81b64c" stroke-width="3"/>`;

    document.body.appendChild(svg);
  }

  updateConnectionStatus(connected) {
    const dot = this.container.querySelector('#status-dot');
    const text = this.container.querySelector('#status-text');
    dot.classList.toggle('disconnected', !connected);
    text.innerHTML = connected
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#81b64c" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Chess API đã kết nối'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e04040" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Chưa kết nối API';
  }

  _getSkillLevel(d) {
    if (d >= 18) return { name: 'Super GM', elo: 2700 };
    if (d >= 16) return { name: 'Grandmaster', elo: 2500 };
    if (d >= 14) return { name: 'Master', elo: 2300 };
    if (d >= 12) return { name: 'Candidate Master', elo: 2000 };
    if (d >= 10) return { name: 'Strong Club', elo: 1700 };
    if (d >= 8) return { name: 'Intermediate', elo: 1400 };
    if (d >= 6) return { name: 'Club Player', elo: 1100 };
    if (d >= 4) return { name: 'Amateur', elo: 800 };
    return { name: 'Beginner', elo: 400 };
  }

  _getPieceInfoAt(sq) {
    const file = sq.charCodeAt(0) - 96, rank = parseInt(sq[1]);
    const piece = document.querySelector(`.piece[class*="square-${file}${rank}"]`);
    if (!piece) return { symbol: '?', name: 'quân' };

    const data = { k: ['♔', 'Vua'], q: ['♕', 'Hậu'], r: ['♖', 'Xe'], b: ['♗', 'Tượng'], n: ['♘', 'Mã'], p: ['♙', 'Tốt'] };
    for (const cls of piece.classList) {
      if (cls.length === 2 && 'wb'.includes(cls[0]) && data[cls[1]]) {
        return { symbol: data[cls[1]][0], name: data[cls[1]][1] };
      }
    }
    return { symbol: '?', name: 'quân' };
  }

  _detectOpeningName() {
    try {
      // Chess.com hiển thị tên khai cuộc trong phần phân tích
      const openingEl = document.querySelector('[data-cy="game-info-opening"], .eco-opening-name, .opening-name, [class*="opening"]');

      // Fallback: lấy từ sidebar analysis
      const analysisOpening = document.querySelector('.analysis-opening, .move-list-eco');

      let openingName = openingEl?.textContent?.trim() || analysisOpening?.textContent?.trim() || '';

      // Loại bỏ mã ECO (A00, B01, etc.) nếu có
      openingName = openingName.replace(/^[A-E]\d{2}:\s*/, '').trim();

      if (openingName && openingName.length > 2) {
        this.gameState.openingName = openingName;
        this.container.querySelector('#opening-info').style.display = 'flex';
        this.container.querySelector('#opening-name').textContent = openingName.length > 25
          ? openingName.slice(0, 22) + '...'
          : openingName;
      } else {
        this.container.querySelector('#opening-info').style.display = 'none';
      }
    } catch (e) {
      // Ignore errors
    }
  }

  _updateAutoDepth() {
    const elo = parseInt(this.gameState.opponentElo?.replace(/\D/g, '') || '0');
    if (!elo) return;

    const depths = [[800, 2], [1000, 4], [1200, 6], [1500, 8], [1800, 10], [2000, 12], [2200, 14], [2500, 16], [2700, 18]];
    let newDepth = 18;
    for (const [e, d] of depths) { if (elo < e) { newDepth = d; break; } }

    if (newDepth !== this.settings.depth) {
      this.settings.depth = newDepth;
      this.container.querySelector('#depth-val').textContent = `${newDepth} (Auto)`;
      this.container.querySelector('#slider-depth').value = newDepth;
      console.log(`[OverlayUI] Auto depth: ${newDepth} for Elo ${elo}`);
    }
  }

  _showPieceNames() {
    this._hidePieceNames();
    const pieceNames = { k: 'Vua', q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã', p: 'Tốt' };

    document.querySelectorAll('.piece').forEach(p => {
      let type = null, isWhite = false;
      for (const cls of p.classList) {
        if (cls.length === 2 && 'wb'.includes(cls[0]) && pieceNames[cls[1]]) {
          type = cls[1]; isWhite = cls[0] === 'w'; break;
        }
      }
      if (!type) return;

      const label = document.createElement('div');
      label.className = `piece-name-label ${isWhite ? 'white-piece' : 'black-piece'}`;
      label.textContent = pieceNames[type];
      label.setAttribute('data-piece-label', 'true');

      const r = p.getBoundingClientRect();
      label.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height - 5}px;transform:translate(-50%,-100%);`;
      document.body.appendChild(label);
    });

    if (!this.pieceNameObserver) {
      this.pieceNameObserver = setInterval(() => {
        if (this.settings.showPieceNames) this._showPieceNames();
      }, 500);
    }
  }

  _hidePieceNames() {
    document.querySelectorAll('[data-piece-label]').forEach(el => el.remove());
    if (this.pieceNameObserver) { clearInterval(this.pieceNameObserver); this.pieceNameObserver = null; }
  }

  _saveSettings() {
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: this.settings });
  }

  _saveSettingsWithFeedback() {
    this._saveSettings();
    const btn = this.container.querySelector('#btn-save');
    const orig = btn.textContent;
    btn.textContent = 'Đã Lưu!';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('saved'); }, 1500);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _getRemainingClockTime() {
    // Đọc thời gian còn lại từ đồng hồ của mình (bottom clock)
    try {
      const bottomClock = document.querySelector('.clock-bottom .clock-time-monospace, .clock-component.clock-bottom');
      if (!bottomClock) return null;

      const text = bottomClock.textContent?.trim();
      if (!text || !text.includes(':')) return null;

      const parts = text.split(':');
      let seconds = 0;
      if (parts.length === 2) {
        seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }

      return seconds * 1000; // Return in ms
    } catch {
      return null;
    }
  }

  destroy() {
    this._hidePieceNames();
    this.autoQueueManager?.stopMonitoring();
    this.container?.remove();
  }
}

// Highlight styles
const highlightStyles = document.createElement('style');
highlightStyles.textContent = `
  @keyframes ext-pulse-from { 0%,100%{box-shadow:inset 0 0 0 2px rgba(251,146,60,0.8),0 0 10px rgba(251,146,60,0.5);background-color:rgba(251,146,60,0.2)} 50%{box-shadow:inset 0 0 0 4px rgba(251,146,60,0.6),0 0 15px rgba(251,146,60,0.7);background-color:rgba(251,146,60,0.3)} }
  @keyframes ext-pulse-to { 0%,100%{box-shadow:inset 0 0 0 2px rgba(34,197,94,0.8),0 0 10px rgba(34,197,94,0.5);background-color:rgba(34,197,94,0.2)} 50%{box-shadow:inset 0 0 0 4px rgba(34,197,94,0.6),0 0 20px rgba(34,197,94,0.7);background-color:rgba(34,197,94,0.35)} }
  .ext-highlight-from { animation:ext-pulse-from 2s infinite; z-index:900!important; }
  .ext-highlight-to { animation:ext-pulse-to 2s infinite; z-index:900!important; }
  #chess-ext-arrow-layer { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:999; }
`;
document.head.appendChild(highlightStyles);

if (typeof window !== 'undefined') {
  window.OverlayUI = OverlayUI;
}
