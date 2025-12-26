export class Brick {
    constructor(rowCoordinate, columnCoordinate, height, width, type = null) {
        this.rowCoordinate = Math.round(rowCoordinate);
        this.columnCoordinate = Math.round(columnCoordinate);
        this.width = width || 60;
        this.height = height;
        this.type = type; // null | 'extraBall' | 'demo'
        this.isOrphan = false;
        this.inertFromSide = null;
        this.updateVisualPosition();
    }

    updateVisualPosition() {
        const standardWidth = this.width;
        const staggerOffset = this.width / 2;
        const rowParity = Math.abs(this.rowCoordinate) % 2;
        const xOffset = (rowParity === 1) ? staggerOffset : 0;
        this.canvasXPosition = (this.columnCoordinate * standardWidth) + xOffset;
        this.canvasYPosition = this.rowCoordinate * this.height;
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.maxBrickWidth = 60;
        this.brickWidth = this.maxBrickWidth;
        this.brickHeight = 25;
        this.columnSpacing = this.brickWidth;
        this.edgeBufferCols = 1;
        this.activeBrickMap = new Map();

        this.specialOnRepairChance = 0.06;
        this.specialBorder = '#00ff88';

        this.masterMinCol = 0;
        this.masterMaxCol = 0;

        this.isDebugPaused = false;
        this.snapshotAtPause = null;
        this.lastImpactCol = null;
        this.lastImpactCoord = null;
        this.lastAuditAdded = [];
        this.lastAuditRemoved = [];

        this.setupTrainingControls();
        this.initializeWall();
    }

    setupTrainingControls() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.toggleTrainingPause();
        });
        this.canvas.addEventListener('pointerdown', (e) => {
            if (!this.isDebugPaused) return;
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const row = Math.round(clickY / this.brickHeight);
            const xShift = (Math.abs(row) % 2 === 1) ? (this.brickWidth / 2) : 0;
            const col = Math.round((clickX - xShift) / this.brickWidth);
            const key = `${col},${row}`;
            if (this.activeBrickMap.has(key)) this.activeBrickMap.delete(key);
            else this.addBrickAt(row, col);
            this.analyzeTopology();
        });
    }

    toggleTrainingPause() {
        if (!this.isDebugPaused) {
            this.isDebugPaused = true;
            this.snapshotAtPause = Array.from(this.activeBrickMap.keys()).sort().join(" | ");
            this.analyzeTopology();
        } else {
            this.isDebugPaused = false;
            this.snapshotAtPause = null;
            this.lastImpactCol = null;
            this.lastImpactCoord = null;
            this.lastAuditAdded = [];
            this.lastAuditRemoved = [];
        }
    }

    getMasonryNeighbors(row, col) {
        const parity = Math.abs(row) % 2;
        const pts = [[row, col - 1], [row, col + 1]];
        if (parity === 0) pts.push([row - 1, col], [row - 1, col - 1], [row + 1, col], [row + 1, col - 1]);
        else pts.push([row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]);
        return pts;
    }

    analyzeTopology() {
        const bricks = Array.from(this.activeBrickMap.values());
        bricks.forEach(b => b.isOrphan = true);
        if (bricks.length === 0) return false;
        const startBricks = bricks.filter(b => b.columnCoordinate <= this.masterMinCol);
        if (startBricks.length === 0) return false;
        const queue = [...startBricks];
        const visited = new Set();
        queue.forEach(b => { visited.add(`${b.columnCoordinate},${b.rowCoordinate}`); b.isOrphan = false; });
        while (queue.length > 0) {
            const curr = queue.shift();
            const neighbors = this.getMasonryNeighbors(curr.rowCoordinate, curr.columnCoordinate);
            for (const [nr, nc] of neighbors) {
                const key = `${nc},${nr}`;
                if (this.activeBrickMap.has(key) && !visited.has(key)) {
                    visited.add(key);
                    const nb = this.activeBrickMap.get(key);
                    nb.isOrphan = false;
                    queue.push(nb);
                }
            }
        }
        return bricks.some(b => b.columnCoordinate >= this.masterMaxCol && !b.isOrphan);
    }

    updateInertFlags() {
        this.topLimit = 4;
        this.bottomLimit = Math.floor((this.canvas.clientHeight) / this.brickHeight) - 2;
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate <= this.topLimit) b.inertFromSide = 'bottom';
            else if (b.rowCoordinate >= this.bottomLimit) b.inertFromSide = 'top';
            else b.inertFromSide = null;
        }
    }

    checkWin() {
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate <= this.topLimit) return 'bottom';
            if (b.rowCoordinate >= this.bottomLimit) return 'top';
        }
        return null;
    }

    initializeWall() {
        this.activeBrickMap.clear();
        this.baselineMiddleRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);
        const screenW = this.canvas.clientWidth || 800;
        const columnsVisible = Math.max(1, Math.round(screenW / this.maxBrickWidth));
        this.brickWidth = screenW / columnsVisible;
        this.columnSpacing = this.brickWidth;
        this.masterMinCol = -this.edgeBufferCols;
        this.masterMaxCol = (columnsVisible - 1) + this.edgeBufferCols;

        for (let c = this.masterMinCol; c <= this.masterMaxCol; c++) {
            this.addBrickAt(this.baselineMiddleRow, c, null);
        }

        // Add the DEMO brick at the center
        const midCol = Math.floor((this.masterMinCol + this.masterMaxCol) / 2);
        const demoKey = `${midCol},${this.baselineMiddleRow}`;
        if (this.activeBrickMap.has(demoKey)) {
            this.activeBrickMap.get(demoKey).type = 'demo';
        }

        this.analyzeTopology();
        this.updateInertFlags();
    }

    getDemoBrick() {
        return Array.from(this.activeBrickMap.values()).find(b => b.type === 'demo');
    }

    addBrickAt(row, col, type = null) {
        const key = `${col},${row}`;
        if (this.activeBrickMap.has(key)) return false;
        const b = new Brick(row, col, this.brickHeight, this.brickWidth, type);
        this.activeBrickMap.set(key, b);
        this.updateInertFlags();
        return true;
    }

    processWallImpact(hitBrick, ballSide) {
        const preKeys = new Set(this.activeBrickMap.keys());
        const hitR = hitBrick.rowCoordinate;
        const hitC = hitBrick.columnCoordinate;
        const delta = (ballSide === 'top' ? 1 : -1);

        this.lastImpactCol = hitC;
        this.lastImpactCoord = { row: hitR, col: hitC };
        this.lastHitBrickType = hitBrick.type || null;

        if (hitBrick.inertFromSide === ballSide) {
            if (hitBrick.type === 'extraBall' || hitBrick.type === 'demo') hitBrick.type = null;
            return;
        }

        this.activeBrickMap.delete(`${hitC},${hitR}`);
        let isConnected = this.analyzeTopology();

        if (!isConnected) {
            const neighbors = this.getMasonryNeighbors(hitR, hitC);
            const mortarCandidates = neighbors.filter(([nr, nc]) => nr === (hitR + delta));
            const candidates = [...mortarCandidates, [hitR, hitC - 1], [hitR, hitC + 1]];

            for (const [cr, cc] of candidates) {
                const key = `${cc},${cr}`;
                if (this.activeBrickMap.has(key)) continue;
                const t = (Math.random() < this.specialOnRepairChance) ? 'extraBall' : null;
                this.addBrickAt(cr, cc, t);
                isConnected = this.analyzeTopology();
                if (isConnected) break;
                else this.activeBrickMap.delete(key);
            }

            if (!isConnected) {
                for (const [cr, cc] of candidates) {
                    const t = (Math.random() < this.specialOnRepairChance) ? 'extraBall' : null;
                    this.addBrickAt(cr, cc, t);
                    isConnected = this.analyzeTopology();
                    if (isConnected) break;
                }
            }
        }
        this.updateInertFlags();
        const postKeys = new Set(this.activeBrickMap.keys());
        this.lastAuditAdded = [...postKeys].filter(k => !preKeys.has(k));
        this.lastAuditRemoved = [...preKeys].filter(k => !postKeys.has(k)).filter(k => k !== `${hitC},${hitR}`);
    }

    update(game) {
        if (this.isDebugPaused) return;
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate < this.topLimit) b.rowCoordinate = this.topLimit;
            if (b.rowCoordinate > this.bottomLimit) b.rowCoordinate = this.bottomLimit;
            b.updateVisualPosition();
        }
        this.updateInertFlags();
    }

    checkCollision(ball) {
        if (this.isDebugPaused) return false;
        let best = null, minPenetration = Infinity, bestPen = null;
        for (const b of this.activeBrickMap.values()) {
            const dx = ball.x - b.canvasXPosition, dy = ball.y - b.canvasYPosition;
            const sX = (b.width / 2) + ball.radius + 2, sY = (b.height / 2) + ball.radius + 2;
            if (Math.abs(dx) <= sX && Math.abs(dy) <= sY) {
                const movingTowards = (ball.side === 'top' && ball.vy > 0) || (ball.side === 'bottom' && ball.vy < 0);
                const verticalOverlap = Math.abs(dy) < (ball.radius + 3);
                const overlapX = sX - Math.abs(dx), overlapY = sY - Math.abs(dy);
                if (movingTowards || verticalOverlap || overlapX > 0.5) {
                    const penetration = Math.min(overlapX, overlapY);
                    if (penetration < minPenetration) { minPenetration = penetration; best = b; bestPen = { dx, dy, overlapX, overlapY }; }
                }
            }
        }
        if (best) {
            this.processWallImpact(best, ball.side);
            if (bestPen.overlapX < bestPen.overlapY) {
                ball.vx *= -1;
                const ejectX = (best.width / 2) + ball.radius + 2;
                ball.x = best.canvasXPosition + (bestPen.dx > 0 ? ejectX : -ejectX);
            } else {
                ball.vy *= -1;
                const ejectY = (best.height / 2) + ball.radius + 2;
                ball.y = best.canvasYPosition + (ball.vy > 0 ? ejectY : -ejectY);
            }
            if (ball.gameSpeed) {
                const s = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
                ball.vx = (ball.vx / s) * ball.gameSpeed; ball.vy = (ball.vy / s) * ball.gameSpeed;
            }
            return true;
        }
        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        for (const b of this.activeBrickMap.values()) {
            const drawW = b.width - 1, drawH = b.height - 1;
            const rx = b.canvasXPosition - (drawW / 2), ry = b.canvasYPosition - (drawH / 2);

            if (b.type === 'demo') {
                ctx.shadowColor = '#00d0ff'; ctx.fillStyle = 'rgba(0, 208, 255, 0.2)'; ctx.strokeStyle = '#00d0ff';
            } else if (b.type === 'extraBall') {
                ctx.shadowColor = b.isOrphan ? '#ff3e3e' : '#00ff88'; ctx.fillStyle = 'rgba(0, 200, 80, 0.12)'; ctx.strokeStyle = '#00ff88';
            } else {
                ctx.shadowColor = b.isOrphan ? '#ff3e3e' : 'rgba(255,255,255,0.3)';
                ctx.fillStyle = b.isOrphan ? 'rgba(255, 62, 62, 0.2)' : 'rgba(255,255,255,0.15)';
                ctx.strokeStyle = b.isOrphan ? '#ff3e3e' : 'rgba(255,255,255,0.4)';
            }

            if (b.inertFromSide) { ctx.fillStyle = 'rgba(200,200,200,0.08)'; ctx.strokeStyle = '#888888'; ctx.shadowColor = '#888888'; }

            ctx.lineWidth = (b.type) ? 2 : 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(rx, ry, drawW, drawH, 4);
            else ctx.rect(rx, ry, drawW, drawH);
            ctx.fill(); ctx.stroke();

            if (b.type === 'demo') {
                ctx.fillStyle = '#00d0ff'; ctx.font = 'bold 10px Montserrat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText("DEMO", b.canvasXPosition, b.canvasYPosition);
            } else if (b.type === 'extraBall') {
                ctx.fillStyle = '#3ac47d'; ctx.beginPath(); ctx.arc(b.canvasXPosition, b.canvasYPosition, 4, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }
}
