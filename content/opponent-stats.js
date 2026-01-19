/**
 * Opponent Stats - 2 badges cạnh đồng hồ (Chess.com style)
 * Badge 1: W/L/Winrate
 * Badge 2: Ratings (Rapid/Blitz/Bullet)
 */
class OpponentStatsOverlay {
    constructor() {
        this.currentOpponent = null;
        this.statsCache = {};
        this.badge1 = null;
        this.badge2 = null;
    }

    init() {
        this._createBadges();
        this._startMonitor();
        console.log('[OpponentStats] Initialized - Dual badges');
    }

    _createBadges() {
        const css = `
            .opp-stats-badge {
                position: fixed;
                z-index: 999998;
                width: 135px;
                height: 44px;
                background: linear-gradient(180deg, #312e2b 0%, #272522 100%);
                border: 1px solid #454341;
                border-radius: 6px;
                font-family: 'Segoe UI', system-ui, sans-serif;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                box-shadow: 0 3px 10px rgba(0,0,0,0.4);
                opacity: 0;
                transition: opacity 0.2s, transform 0.15s;
            }
            .opp-stats-badge.visible { opacity: 1; }
            .opp-stats-badge:hover { transform: translateY(-1px); box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            
            .opp-stats-badge .badge-title {
                font-size: 9px;
                color: #9e9b97;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 600;
                margin-bottom: 3px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .opp-stats-badge .badge-icon {
                width: 10px;
                height: 10px;
                fill: currentColor;
            }
            .opp-stats-badge .stats-row {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .opp-stats-badge .stat-w { 
                color: #81b64c; 
                font-weight: 700; 
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 2px;
            }
            .opp-stats-badge .stat-l { 
                color: #e04040; 
                font-weight: 700; 
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 2px;
            }
            .opp-stats-badge .stat-sep { 
                color: #454341; 
                font-size: 11px; 
                font-weight: 400;
            }
            .opp-stats-badge .winrate {
                font-size: 11px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                margin-left: 3px;
            }
            .opp-stats-badge .wr-good { background: rgba(129,182,76,0.2); color: #81b64c; border: 1px solid rgba(129,182,76,0.3); }
            .opp-stats-badge .wr-mid { background: rgba(250,156,27,0.2); color: #fa9c1b; border: 1px solid rgba(250,156,27,0.3); }
            .opp-stats-badge .wr-bad { background: rgba(224,64,64,0.2); color: #e04040; border: 1px solid rgba(224,64,64,0.3); }
            
            .opp-stats-badge .rating-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
            }
            .opp-stats-badge .rating-item {
                display: flex;
                align-items: center;
                gap: 3px;
            }
            .opp-stats-badge .rating-icon {
                width: 11px;
                height: 11px;
                fill: #9e9b97;
            }
            .opp-stats-badge .rating-val { 
                color: #fff; 
                font-weight: 600;
                font-size: 12px;
            }
            .opp-stats-badge .rating-val.no-rating {
                color: #666;
                font-size: 10px;
            }
        `;

        if (!document.getElementById('opp-stats-css')) {
            const style = document.createElement('style');
            style.id = 'opp-stats-css';
            style.textContent = css;
            document.head.appendChild(style);
        }

        // Badge 1: W/L/Winrate
        this.badge1 = document.createElement('div');
        this.badge1.id = 'opp-stats-badge1';
        this.badge1.className = 'opp-stats-badge';
        this.badge1.innerHTML = '<div class="stats-content"><span style="color:#666;font-size:9px">...</span></div>';
        document.body.appendChild(this.badge1);

        // Badge 2: Ratings
        this.badge2 = document.createElement('div');
        this.badge2.id = 'opp-stats-badge2';
        this.badge2.className = 'opp-stats-badge';
        this.badge2.innerHTML = '<div class="stats-content"><span style="color:#666;font-size:9px">...</span></div>';
        document.body.appendChild(this.badge2);
    }

    _startMonitor() {
        setInterval(() => this._update(), 800);
    }

    _update() {
        const clock = document.querySelector('#board-layout-player-top .clock-component');
        if (!clock) {
            this.badge1.classList.remove('visible');
            this.badge2.classList.remove('visible');
            return;
        }

        const rect = clock.getBoundingClientRect();
        this.badge1.style.left = (rect.left - 290) + 'px';
        this.badge1.style.top = rect.top + 'px';
        this.badge2.style.left = (rect.left - 145) + 'px';
        this.badge2.style.top = rect.top + 'px';

        const usernameEl = document.querySelector('#board-layout-player-top .cc-user-username-component');
        if (!usernameEl) return;

        const username = usernameEl.textContent?.trim();
        if (!username) return;

        if (username !== this.currentOpponent) {
            this.currentOpponent = username;
            this._fetchStats(username);
        }
    }

    async _fetchStats(username) {
        this.badge1.querySelector('.stats-content').innerHTML = '<span style="color:#666;font-size:9px">Tải...</span>';
        this.badge2.querySelector('.stats-content').innerHTML = '<span style="color:#666;font-size:9px">Tải...</span>';
        this.badge1.classList.add('visible');
        this.badge2.classList.add('visible');

        if (this.statsCache[username]) {
            this._renderStats(this.statsCache[username]);
            return;
        }

        try {
            const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`);
            if (!res.ok) throw new Error('API');
            const stats = await res.json();
            this.statsCache[username] = stats;
            this._renderStats(stats);
        } catch (e) {
            console.error('[OpponentStats]', e);
            this.badge1.querySelector('.stats-content').innerHTML = '<span style="color:#e04040;font-size:9px">Lỗi</span>';
            this.badge2.querySelector('.stats-content').innerHTML = '<span style="color:#e04040;font-size:9px">Lỗi</span>';
        }
    }

    _renderStats(stats) {
        // SVG Icons
        const chartIcon = '<svg class="badge-icon" viewBox="0 0 24 24"><path d="M3 13h2v8H3v-8zm16 0h2v8h-2v-8zm-8-8h2v16h-2V5zm-4 4h2v12H7V9zm8 3h2v9h-2v-9z"/></svg>';
        const starIcon = '<svg class="badge-icon" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
        const clockIcon = '<svg class="rating-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        const boltIcon = '<svg class="rating-icon" viewBox="0 0 24 24"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66l.1-.16L11 5h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15L11 21z"/></svg>';
        const bulletIcon = '<svg class="rating-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>';

        // === Badge 1: W/L/Winrate ===
        const rr = stats.chess_rapid?.record || { win: 0, loss: 0, draw: 0 };
        const br = stats.chess_blitz?.record || { win: 0, loss: 0, draw: 0 };
        const bu = stats.chess_bullet?.record || { win: 0, loss: 0, draw: 0 };

        const w = rr.win + br.win + bu.win;
        const l = rr.loss + br.loss + bu.loss;
        const total = w + l + (rr.draw + br.draw + bu.draw);
        const wr = total > 0 ? Math.round((w / total) * 100) : 0;

        let wrClass = wr >= 55 ? 'wr-good' : (wr >= 45 ? 'wr-mid' : 'wr-bad');

        this.badge1.querySelector('.stats-content').innerHTML = `
            <div class="badge-title">${chartIcon}THỐNG KÊ</div>
            <div class="stats-row">
                <span class="stat-w">${w}W</span>
                <span class="stat-sep">/</span>
                <span class="stat-l">${l}L</span>
                <span class="winrate ${wrClass}">${wr}%</span>
            </div>
        `;

        // === Badge 2: Ratings ===
        const rapid = stats.chess_rapid?.last?.rating;
        const blitz = stats.chess_blitz?.last?.rating;
        const bullet = stats.chess_bullet?.last?.rating;

        // Chọn rating chính (ưu tiên rapid > blitz > bullet)
        const mainRating = rapid || blitz || bullet || '-';

        this.badge2.querySelector('.stats-content').innerHTML = `
            <div class="badge-title">${starIcon}RATING</div>
            <div class="rating-row">
                <div class="rating-item" title="Rapid">
                    ${clockIcon}
                    <span class="rating-val ${!rapid ? 'no-rating' : ''}">${rapid || '-'}</span>
                </div>
                <div class="rating-item" title="Blitz">
                    ${boltIcon}
                    <span class="rating-val ${!blitz ? 'no-rating' : ''}">${blitz || '-'}</span>
                </div>
                <div class="rating-item" title="Bullet">
                    ${bulletIcon}
                    <span class="rating-val ${!bullet ? 'no-rating' : ''}">${bullet || '-'}</span>
                </div>
            </div>
        `;
    }

    destroy() {
        this.badge1?.remove();
        this.badge2?.remove();
        document.getElementById('opp-stats-css')?.remove();
    }
}

if (typeof window !== 'undefined') {
    window.OpponentStatsOverlay = OpponentStatsOverlay;
}
