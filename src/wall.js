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
        // Center so column 0 starts at 0 (without stagger)
        this.canvasXPosition = (this.columnCoordinate * standardWidth) + xOffset + (standardWidth / 2);
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

        // Hit registry to prevent tunneling and simultaneous hit issues
        this.pendingImpacts = new Map(); // Map of brickKey -> side

        this.initializeWall();
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
            if (b.rowCoordinate <= this.topLimit) return { winner: 'bottom', brick: b };
            if (b.rowCoordinate >= this.bottomLimit) return { winner: 'top', brick: b };
        }
        return null;
    }

    initializeWall() {
        this.activeBrickMap.clear();
        this.pendingImpacts.clear();
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

    // Process a single hit impact - now separated from detection
    processWallImpact(hitBrick, ballSide) {
        const preKeys = new Set(this.activeBrickMap.keys());
        const hitR = hitBrick.rowCoordinate;
        const hitC = hitBrick.columnCoordinate;
        const delta = (ballSide === 'top' ? 1 : -1);

        this.lastHitBrickType = hitBrick.type || null;

        if (hitBrick.inertFromSide === ballSide) {
            if (hitBrick.type === 'extraBall' || hitBrick.type === 'removeBall' || hitBrick.type === 'enlargePaddle' || hitBrick.type === 'shrinkPaddle' || hitBrick.type === 'demo') hitBrick.type = null;
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
                let t = null;
                if (Math.random() < this.specialOnRepairChance) {
                    const rnd = Math.random();
                    if (rnd < 0.4) t = 'extraBall';
                    else if (rnd < 0.5) t = 'removeBall';
                    else if (rnd < 0.9) t = 'enlargePaddle';
                    else t = 'shrinkPaddle';
                }
                this.addBrickAt(cr, cc, t);
                isConnected = this.analyzeTopology();
                if (isConnected) break;
                else this.activeBrickMap.delete(key);
            }

            if (!isConnected) {
                for (const [cr, cc] of candidates) {
                    let t = null;
                    if (Math.random() < this.specialOnRepairChance) {
                        const rnd = Math.random();
                        if (rnd < 0.4) t = 'extraBall';
                        else if (rnd < 0.5) t = 'removeBall';
                        else if (rnd < 0.9) t = 'enlargePaddle';
                        else t = 'shrinkPaddle';
                    }
                    this.addBrickAt(cr, cc, t);
                    isConnected = this.analyzeTopology();
                    if (isConnected) break;
                }
            }
        }
        this.updateInertFlags();
    }

    resolvePendingImpacts() {
        for (const [key, side] of this.pendingImpacts.entries()) {
            const b = this.activeBrickMap.get(key);
            if (b) {
                this.processWallImpact(b, side);
            }
        }
        this.pendingImpacts.clear();
    }

    update(game) {
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate < this.topLimit) b.rowCoordinate = this.topLimit;
            if (b.rowCoordinate > this.bottomLimit) b.rowCoordinate = this.bottomLimit;
            b.updateVisualPosition();
        }
        this.updateInertFlags();
    }

    checkCollision(ball) {
        // OPTIMIZATION: Spatial Grid Lookup
        // Instead of checking ALL bricks, we only check the ones immediately around the ball coordinate.
        const estRow = Math.round(ball.y / this.brickHeight);

        // Search a 3x3 neighborhood around the estimated position
        let best = null, minPenetration = Infinity, bestPen = null;

        for (let r = estRow - 1; r <= estRow + 1; r++) {
            const xShift = (Math.abs(r) % 2 === 1) ? (this.brickWidth / 2) : 0;
            const estCol = Math.round((ball.x - xShift) / this.brickWidth);

            for (let c = estCol - 1; c <= estCol + 1; c++) {
                const b = this.activeBrickMap.get(`${c},${r}`);
                if (!b) continue;

                const dx = ball.x - b.canvasXPosition, dy = ball.y - b.canvasYPosition;
                const sX = (b.width / 2) + ball.radius + 1, sY = (b.height / 2) + ball.radius + 1;

                if (Math.abs(dx) <= sX && Math.abs(dy) <= sY) {
                    const towardsX = (ball.vx > 0 && dx < 0) || (ball.vx < 0 && dx > 0);
                    const towardsY = (ball.vy > 0 && dy < 0) || (ball.vy < 0 && dy > 0);

                    // If moving away from both axes, no collision possible (already resolving or past center)
                    if (!towardsX && !towardsY) continue;

                    const overlapX = sX - Math.abs(dx), overlapY = sY - Math.abs(dy);
                    const penetration = Math.min(overlapX, overlapY);

                    // Resolve the bounce axis: choose smaller overlap but ONLY if moving towards it
                    let chosenAxis = (overlapX < overlapY) ? 'x' : 'y';
                    if (chosenAxis === 'x' && !towardsX) chosenAxis = 'y';
                    if (chosenAxis === 'y' && !towardsY) chosenAxis = 'x';

                    // Final validation for the chosen axis
                    if (chosenAxis === 'x' && !towardsX) continue;
                    if (chosenAxis === 'y' && !towardsY) continue;

                    if (penetration < minPenetration) {
                        minPenetration = penetration;
                        best = b;
                        bestPen = { dx, dy, overlapX, overlapY, axis: chosenAxis };
                    }
                }
            }
        }

        if (best) {
            const key = `${best.columnCoordinate},${best.rowCoordinate}`;
            this.pendingImpacts.set(key, ball.side);
            this.lastHitBrickType = best.type;

            if (bestPen.axis === 'x') {
                ball.vx *= -1;
                const ejectX = (best.width / 2) + ball.radius + 2;
                ball.x = best.canvasXPosition + (bestPen.dx > 0 ? ejectX : -ejectX);
            } else {
                ball.vy *= -1;
                const ejectY = (best.height / 2) + ball.radius + 2;
                ball.y = best.canvasYPosition + (ball.vy > 0 ? ejectY : -ejectY);
            }
            return true;
        }
        return false;
    }

    draw(ctx) {
        ctx.save();

        // Clip to canvas to prevent "peeking" buffer bricks
        ctx.beginPath();
        ctx.rect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        ctx.clip();

        // Shadows are EXPENSIVE on slower mobile devices. 
        // We only enable them for special bricks to keep draw calls fast.
        for (const b of this.activeBrickMap.values()) {
            const drawW = b.width - 1, drawH = b.height - 1;
            const rx = b.canvasXPosition - (drawW / 2), ry = b.canvasYPosition - (drawH / 2);

            ctx.shadowBlur = 0; // Default off

            if (b.type === 'demo') {
                ctx.shadowBlur = 10; ctx.shadowColor = '#00d0ff';
                ctx.fillStyle = 'rgba(0, 208, 255, 0.2)'; ctx.strokeStyle = '#00d0ff';
            } else if (b.type === 'extraBall') {
                ctx.shadowBlur = 8; ctx.shadowColor = '#00ff88';
                ctx.fillStyle = 'rgba(0, 255, 136, 0.15)'; ctx.strokeStyle = '#00ff88';
            } else if (b.type === 'removeBall') {
                ctx.shadowBlur = 8; ctx.shadowColor = '#ff3e3e';
                ctx.fillStyle = 'rgba(255, 62, 62, 0.15)'; ctx.strokeStyle = '#ff3e3e';
            } else if (b.type === 'enlargePaddle') {
                ctx.shadowBlur = 8; ctx.shadowColor = '#3e8dff';
                ctx.fillStyle = 'rgba(62, 141, 255, 0.15)'; ctx.strokeStyle = '#3e8dff';
            } else if (b.type === 'shrinkPaddle') {
                ctx.shadowBlur = 8; ctx.shadowColor = '#ff9f3e';
                ctx.fillStyle = 'rgba(255, 159, 62, 0.15)'; ctx.strokeStyle = '#ff9f3e';
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            }

            if (b.inertFromSide) {
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(200,200,200,0.08)';
                ctx.strokeStyle = (b.inertFromSide === 'top') ? '#ff3e3e44' : '#3e8dff44';
            }

            ctx.lineWidth = (b.type) ? 2 : 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(rx, ry, drawW, drawH, 4);
            else ctx.rect(rx, ry, drawW, drawH);
            ctx.fill(); ctx.stroke();

            // Clean up shadow for text/circles
            if (b.type) {
                ctx.shadowBlur = 0;
                if (b.type === 'demo') {
                    ctx.fillStyle = '#00d0ff'; ctx.font = 'bold 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText("DEMO", b.canvasXPosition, b.canvasYPosition + 1);
                } else if (b.type === 'extraBall') {
                    // Green outlined ball with +
                    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.canvasXPosition, b.canvasYPosition, 7, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#00ff88'; ctx.font = 'bold 14px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText("+", b.canvasXPosition, b.canvasYPosition + 1);
                } else if (b.type === 'removeBall') {
                    // Red outlined ball with -
                    ctx.strokeStyle = '#ff3e3e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.canvasXPosition, b.canvasYPosition, 7, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#ff3e3e'; ctx.font = 'bold 16px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText("-", b.canvasXPosition, b.canvasYPosition);
                } else if (b.type === 'enlargePaddle') {
                    // Outward arrows <-->
                    ctx.strokeStyle = '#3e8dff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    const x = b.canvasXPosition, y = b.canvasYPosition, w = 12, h = 6;
                    ctx.beginPath();
                    ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); // Main line
                    // Left arrow <
                    ctx.moveTo(x - w + h, y - h / 2); ctx.lineTo(x - w, y); ctx.lineTo(x - w + h, y + h / 2);
                    // Right arrow >
                    ctx.moveTo(x + w - h, y - h / 2); ctx.lineTo(x + w, y); ctx.lineTo(x + w - h, y + h / 2);
                    ctx.stroke();
                } else if (b.type === 'shrinkPaddle') {
                    // Inward arrows >-<
                    ctx.strokeStyle = '#ff9f3e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    const x = b.canvasXPosition, y = b.canvasYPosition, w = 12, h = 6;
                    ctx.beginPath();
                    ctx.moveTo(x - w + h, y); ctx.lineTo(x + w - h, y); // Main line
                    // Left arrow >
                    ctx.moveTo(x - w, y - h / 2); ctx.lineTo(x - w + h, y); ctx.lineTo(x - w, y + h / 2);
                    // Right arrow <
                    ctx.moveTo(x + w, y - h / 2); ctx.lineTo(x + w - h, y); ctx.lineTo(x + w, y + h / 2);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

}
