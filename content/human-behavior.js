/**
 * Human Behavior Simulator - Anti-Ban System
 * Mô phỏng hành vi người chơi cờ thật với time pressure awareness
 */

class HumanBehavior {
    constructor() {
        this.moveHistory = [];
        this.sessionStartTime = Date.now();
        this.lastMoveTime = Date.now();
        this.profile = this._generateProfile();
    }

    _generateProfile() {
        return {
            skillLevel: Math.random(),
            impulsiveness: Math.random(),
            consistency: 0.6 + Math.random() * 0.3,
            fatigueRate: 0.001 + Math.random() * 0.003,
            currentFatigue: 0
        };
    }

    calculateThinkTime(data = {}) {
        const {
            eval: evalScore = 0,
            moveNumber = 1,
            isCapture = false,
            isCheck = false,
            isForcedMove = false,
            numLegalMoves = 20,
            positionComplexity = 0.5,
            timeLimit = 600,
            timeType = 'rapid',
            remainingTime = null // Thời gian còn lại trên đồng hồ (ms)
        } = data;

        // ===== EMERGENCY TIME PROTECTION - KHÔNG THUA VÌ HẾT GIỜ =====
        if (remainingTime !== null) {
            const remainingSec = remainingTime / 1000;

            // EMERGENCY MODE: Còn < 3 giây → ĐI NGAY LẬP TỨC
            if (remainingSec < 3) {
                console.log(`[HumanBehavior] 🚨 EMERGENCY! Chỉ còn ${remainingSec.toFixed(1)}s - ĐI NGAY!`);
                return 50; // 50ms delay tối thiểu
            }

            // CRITICAL MODE: Còn < 5 giây → Tối đa 100ms
            if (remainingSec < 5) {
                console.log(`[HumanBehavior] ⚠️ CRITICAL! Còn ${remainingSec.toFixed(1)}s - Đi rất nhanh!`);
                return 50 + Math.random() * 100; // 50-150ms
            }

            // DANGER MODE: Còn < 10 giây → Tối đa 300ms
            if (remainingSec < 10) {
                console.log(`[HumanBehavior] ⚡ DANGER! Còn ${remainingSec.toFixed(1)}s - Đi nhanh!`);
                return 100 + Math.random() * 200; // 100-300ms
            }
        }

        // ===== TIME PRESSURE DETECTION =====
        let timePressureMultiplier = 1.0;

        if (remainingTime !== null) {
            const remainingSec = remainingTime / 1000;

            if (timeType === 'bullet') {
                // Bullet: panic dưới 15s, critical dưới 5s
                if (remainingSec < 15) timePressureMultiplier = 0.3;
                else if (remainingSec < 30) timePressureMultiplier = 0.6;
            } else if (timeType === 'blitz') {
                // Blitz: panic dưới 30s, critical dưới 10s  
                if (remainingSec < 30) timePressureMultiplier = 0.4;
                else if (remainingSec < 60) timePressureMultiplier = 0.7;
            } else {
                // Rapid: panic dưới 60s, critical dưới 20s
                if (remainingSec < 20) timePressureMultiplier = 0.3;
                else if (remainingSec < 60) timePressureMultiplier = 0.5;
                else if (remainingSec < 120) timePressureMultiplier = 0.8;
            }
        }

        // ===== BASE TIME CALCULATION =====
        let baseTime;

        if (timeType === 'bullet') {
            if (moveNumber <= 10) baseTime = 100 + Math.random() * 300;
            else baseTime = 200 + Math.random() * 500;
        } else if (timeType === 'blitz') {
            if (moveNumber <= 10) baseTime = 300 + Math.random() * 800;
            else if (moveNumber <= 30) baseTime = 800 + Math.random() * 2000;
            else baseTime = 500 + Math.random() * 1500;
        } else {
            if (moveNumber <= 10) baseTime = 500 + Math.random() * 1500;
            else if (moveNumber <= 30) baseTime = 2000 + Math.random() * 5000;
            else baseTime = 1500 + Math.random() * 4000;
        }

        // ===== SITUATION MULTIPLIERS =====
        let mult = 1.0;
        if (isForcedMove || numLegalMoves === 1) mult *= 0.15; // Nước đi bắt buộc
        if (isCheck) mult *= 1.2;
        if (isCapture) mult *= 0.7;
        mult *= (1 + positionComplexity * 0.4);
        if (Math.abs(evalScore) > 3) mult *= 1.3; // Tình huống phức tạp

        // Player profile adjustments
        mult *= (1.15 - this.profile.skillLevel * 0.3);
        this.profile.currentFatigue += this.profile.fatigueRate;
        mult *= (1 + this.profile.currentFatigue * 0.2);
        if (this.profile.impulsiveness > 0.7) mult *= 0.6;

        // Apply time pressure
        mult *= timePressureMultiplier;

        let thinkTime = baseTime * mult;

        // ===== ABSOLUTE LIMITS =====
        let absoluteMin = 50;
        let absoluteMax = 15000;

        if (timeType === 'bullet') { absoluteMin = 30; absoluteMax = 1000; }
        else if (timeType === 'blitz') { absoluteMin = 100; absoluteMax = 4000; }

        // Extra low limit when under severe time pressure
        if (timePressureMultiplier < 0.3) {
            absoluteMax = Math.min(absoluteMax, 500);
        }

        thinkTime = Math.max(absoluteMin, Math.min(absoluteMax, thinkTime));
        thinkTime = this._addGaussianNoise(thinkTime, this.profile.consistency);

        // Random variations (giảm khi time pressure)
        if (timePressureMultiplier > 0.5) {
            if (Math.random() < 0.05) thinkTime *= 0.3; // Premove
            if (Math.random() < 0.08) thinkTime *= 1.6; // Long think
        }

        const pressureStr = timePressureMultiplier < 1 ? ` [PRESSURE x${timePressureMultiplier.toFixed(1)}]` : '';
        console.log(`[HumanBehavior] Think: ${(thinkTime / 1000).toFixed(1)}s (move ${moveNumber}, ${timeType})${pressureStr}`);

        return Math.round(thinkTime);
    }

    _addGaussianNoise(value, consistency) {
        const variance = 1 - consistency;
        const u1 = Math.random(), u2 = Math.random();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.max(0, value + gaussian * variance * value * 0.15);
    }

    generateBezierPath(fromX, fromY, toX, toY, points = 20) {
        const path = [];
        const midX = (fromX + toX) / 2 + (Math.random() - 0.5) * 80;
        const midY = (fromY + toY) / 2 + (Math.random() - 0.5) * 80;
        const overshoot = Math.random() < 0.12;

        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const x = Math.pow(1 - t, 2) * fromX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * toX;
            const y = Math.pow(1 - t, 2) * fromY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * toY;
            path.push({
                x: x + (Math.random() - 0.5) * 2,
                y: y + (Math.random() - 0.5) * 2
            });
        }

        if (overshoot) {
            path.push({ x: toX + (Math.random() - 0.5) * 15, y: toY + (Math.random() - 0.5) * 15 });
            path.push({ x: toX, y: toY });
        }

        return path;
    }

    async simulateHesitation() {
        if (Math.random() >= 0.2) return;
        const time = 200 + Math.random() * 800;
        await this.sleep(time);
    }

    getDragSpeed(progress) {
        return 1 - Math.pow(1 - progress, 2);
    }

    recordMove(moveTime) {
        this.moveHistory.push({ time: moveTime, timestamp: Date.now() });
        this.lastMoveTime = Date.now();
        if (this.moveHistory.length > 50) this.moveHistory.shift();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Opponent Tempo Tracker - Theo dõi tempo đối thủ thông minh hơn
 */
class OpponentTempoTracker {
    constructor() {
        this.opponentMoves = [];
        this.averageTempo = 3000;
        this.lastOpponentMoveTime = null;
        this.fastMoveStreak = 0; // Đếm số lần đối thủ đánh nhanh liên tiếp
    }

    recordOpponentMove(timestamp = Date.now()) {
        if (!this.lastOpponentMoveTime) {
            this.lastOpponentMoveTime = timestamp;
            return;
        }

        const thinkTime = timestamp - this.lastOpponentMoveTime;

        if (thinkTime > 100 && thinkTime < 120000) {
            this.opponentMoves.push(thinkTime);
            if (this.opponentMoves.length > 10) this.opponentMoves.shift();
            this.averageTempo = this.opponentMoves.reduce((a, b) => a + b, 0) / this.opponentMoves.length;

            // Track fast move streaks
            if (thinkTime < 1000) {
                this.fastMoveStreak++;
            } else {
                this.fastMoveStreak = 0;
            }
        }

        this.lastOpponentMoveTime = timestamp;
    }

    adjustBotThinkTime(baseTime, timeType = 'rapid') {
        if (this.opponentMoves.length < 2) return baseTime;

        // Correlation factor - đối thủ đánh nhanh thì mình cũng nhanh hơn
        let correlation = 0.4;

        // Nếu đối thủ đánh nhanh liên tục, tăng correlation
        if (this.fastMoveStreak >= 3) {
            correlation = 0.6;
        }

        let adjusted = this.averageTempo * correlation + baseTime * (1 - correlation);

        // Add randomness
        adjusted *= 1 + (Math.random() - 0.5) * 0.25;

        // Dynamic min/max based on game type and opponent tempo
        let min, max;
        if (timeType === 'bullet') {
            min = Math.max(30, this.averageTempo * 0.3);
            max = Math.min(1500, this.averageTempo * 2);
        } else if (timeType === 'blitz') {
            min = Math.max(100, this.averageTempo * 0.25);
            max = Math.min(5000, this.averageTempo * 2.5);
        } else {
            min = Math.max(200, this.averageTempo * 0.2);
            max = Math.min(15000, this.averageTempo * 3);
        }

        adjusted = Math.max(min, Math.min(max, adjusted));

        console.log(`[TempoTracker] Opp avg: ${(this.averageTempo / 1000).toFixed(1)}s → Bot: ${(adjusted / 1000).toFixed(1)}s`);
        return Math.round(adjusted);
    }

    reset() {
        this.opponentMoves = [];
        this.averageTempo = 3000;
        this.lastOpponentMoveTime = null;
        this.fastMoveStreak = 0;
    }
}

if (typeof window !== 'undefined') {
    window.HumanBehavior = HumanBehavior;
    window.OpponentTempoTracker = OpponentTempoTracker;
}
