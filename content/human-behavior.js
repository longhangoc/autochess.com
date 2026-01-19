/**
 * Human Behavior Simulator - Anti-Ban System
 * Mô phỏng hành vi người chơi cờ thật
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
            minThinkTime: 800 + Math.random() * 1200,
            maxThinkTime: 3000 + Math.random() * 7000,
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
            timeLimit = 600, // Def 10m
            timeType = 'rapid' // bullet, blitz, rapid
        } = data;

        // Base time theo giai đoạn và TIME TYPE
        let baseTime;

        if (timeType === 'bullet') {
            // Bullet (1-2 mins): Sieu nhanh
            if (moveNumber <= 10) baseTime = 100 + Math.random() * 300;
            else baseTime = 200 + Math.random() * 500;
        } else if (timeType === 'blitz') {
            // Blitz (3-5 mins): Nhanh
            if (moveNumber <= 10) baseTime = 300 + Math.random() * 800;
            else if (moveNumber <= 30) baseTime = 800 + Math.random() * 2000;
            else baseTime = 500 + Math.random() * 1500;
        } else {
            // Rapid (10m+): Cham
            if (moveNumber <= 10) baseTime = 500 + Math.random() * 1500;
            else if (moveNumber <= 30) baseTime = 2000 + Math.random() * 5000;
            else baseTime = 1500 + Math.random() * 4000;
        }

        // Multiplier theo tình huống
        let mult = 1.0;
        if (isForcedMove || numLegalMoves === 1) mult *= 0.2;
        if (isCheck) mult *= 1.3;
        if (isCapture) mult *= 0.8;
        mult *= (1 + positionComplexity * 0.5);
        if (Math.abs(evalScore) > 2) mult *= 1.5;

        // Player profile
        mult *= (1.2 - this.profile.skillLevel * 0.4);
        this.profile.currentFatigue += this.profile.fatigueRate;
        mult *= (1 + this.profile.currentFatigue * 0.3);
        if (this.profile.impulsiveness > 0.7) mult *= 0.7;

        let thinkTime = baseTime * mult;

        // Cap min/max theo time type
        let absoluteMin = 100;
        let absoluteMax = 20000;

        if (timeType === 'bullet') { absoluteMin = 50; absoluteMax = 1500; }
        else if (timeType === 'blitz') { absoluteMin = 200; absoluteMax = 5000; }

        thinkTime = Math.max(absoluteMin, Math.min(absoluteMax, thinkTime));
        thinkTime = this._addGaussianNoise(thinkTime, this.profile.consistency);

        // Random variations
        if (Math.random() < 0.05) thinkTime *= 0.3; // Premove
        if (Math.random() < 0.1) thinkTime *= 1.8;  // Long think

        console.log(`[HumanBehavior] Think: ${(thinkTime / 1000).toFixed(1)}s (move ${moveNumber}, ${timeType})`);
        return Math.round(thinkTime);
    }

    _addGaussianNoise(value, consistency) {
        const variance = 1 - consistency;
        const u1 = Math.random(), u2 = Math.random();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.max(0, value + gaussian * variance * value * 0.2);
    }

    generateBezierPath(fromX, fromY, toX, toY, points = 20) {
        const path = [];
        const midX = (fromX + toX) / 2 + (Math.random() - 0.5) * 100;
        const midY = (fromY + toY) / 2 + (Math.random() - 0.5) * 100;
        const overshoot = Math.random() < 0.15;

        for (let i = 0; i <= points; i++) {
            const t = i / points;
            const x = Math.pow(1 - t, 2) * fromX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * toX;
            const y = Math.pow(1 - t, 2) * fromY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * toY;
            path.push({
                x: x + (Math.random() - 0.5) * 3,
                y: y + (Math.random() - 0.5) * 3
            });
        }

        if (overshoot) {
            path.push({ x: toX + (Math.random() - 0.5) * 20, y: toY + (Math.random() - 0.5) * 20 });
            path.push({ x: toX, y: toY });
        }

        return path;
    }

    async simulateHesitation() {
        if (Math.random() >= 0.25) return;
        const time = 300 + Math.random() * 1200;
        // console.log(`[HumanBehavior] Hesitating ${(time / 1000).toFixed(2)}s`);
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
 * Opponent Tempo Tracker
 */
class OpponentTempoTracker {
    constructor() {
        this.opponentMoves = [];
        this.averageTempo = 3000;
        this.lastOpponentMoveTime = null;
    }

    recordOpponentMove(timestamp = Date.now()) {
        if (!this.lastOpponentMoveTime) {
            this.lastOpponentMoveTime = timestamp;
            return;
        }

        const thinkTime = timestamp - this.lastOpponentMoveTime;

        if (thinkTime > 200 && thinkTime < 120000) {
            this.opponentMoves.push(thinkTime);
            if (this.opponentMoves.length > 10) this.opponentMoves.shift();
            this.averageTempo = this.opponentMoves.reduce((a, b) => a + b, 0) / this.opponentMoves.length;
            // console.log(`[TempoTracker] Avg: ${(this.averageTempo / 1000).toFixed(1)}s`);
        }

        this.lastOpponentMoveTime = timestamp;
    }

    adjustBotThinkTime(baseTime) {
        if (this.opponentMoves.length < 2) return baseTime;

        const correlation = 0.5;
        let adjusted = this.averageTempo * correlation + baseTime * (1 - correlation);
        adjusted *= 1 + (Math.random() - 0.5) * 0.3;

        const min = Math.min(200, this.averageTempo * 0.2); // Lower min for bullet
        const max = Math.max(15000, this.averageTempo * 3);
        adjusted = Math.max(min, Math.min(max, adjusted));

        console.log(`[TempoTracker] Adj: ${(adjusted / 1000).toFixed(1)}s`);
        return Math.round(adjusted);
    }

    reset() {
        this.opponentMoves = [];
        this.averageTempo = 3000;
        this.lastOpponentMoveTime = null;
    }
}

if (typeof window !== 'undefined') {
    window.HumanBehavior = HumanBehavior;
    window.OpponentTempoTracker = OpponentTempoTracker;
}
