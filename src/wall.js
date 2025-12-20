export class Brick {
    constructor(rowCoordinate, columnCoordinate, height) {
        this.rowCoordinate = Math.round(rowCoordinate);
        this.columnCoordinate = Math.round(columnCoordinate);
        this.width = 60;
        this.height = height;
        this.updateVisualPosition();
    }

    updateVisualPosition() {
        const standardWidth = 60;
        const staggerOffset = 30; // 50% shift for staggered masonry
        const rowParity = Math.abs(this.rowCoordinate) % 2;
        const xOffset = (rowParity === 1) ? staggerOffset : 0;
        this.canvasXPosition = (this.columnCoordinate * standardWidth) + xOffset;
        this.canvasYPosition = (this.rowCoordinate * this.height);
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.brickWidth = 60;
        this.brickHeight = 25;
        this.columnSpacing = 60;

        // Logical state: The active ribbon
        this.activeBrickMap = new Map();

        this.initializeWall();
    }

    initializeWall() {
        this.activeBrickMap.clear();
        const screenWidth = this.canvas.clientWidth || 800;
        const firstCol = Math.floor(-150 / this.columnSpacing);
        const lastCol = Math.ceil((screenWidth + 150) / this.columnSpacing);
        this.baselineMiddleRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);

        for (let col = firstCol; col <= lastCol; col++) {
            this.addBrickAt(this.baselineMiddleRow, col);
        }
    }

    addBrickAt(row, col) {
        const key = `${col},${row}`;
        if (this.activeBrickMap.has(key)) return;
        this.activeBrickMap.set(key, new Brick(row, col, this.brickHeight));
    }

    removeBrickAt(row, col) {
        this.activeBrickMap.delete(`${col},${row}`);
    }

    getMasonryNeighbors(row, col) {
        const parity = Math.abs(row) % 2;
        // 6-point adjacency in a staggered grid
        const points = [[row, col - 1], [row, col + 1]];
        if (parity === 0) {
            points.push([row - 1, col], [row - 1, col - 1], [row + 1, col], [row + 1, col - 1]);
        } else {
            points.push([row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]);
        }
        return points;
    }

    // THE TOPOLOGICAL RIBBON ARCHITECT (v36: Learned Rules)
    processWallImpact(hitBrick, ballSide) {
        const oldRowIdx = hitBrick.rowCoordinate;
        const colIdx = hitBrick.columnCoordinate;
        const pushDelta = (ballSide === 'top' ? 1 : -1);
        const targetRowIdx = oldRowIdx + pushDelta;

        // --- LEARNED RULE: SURGICAL MOVE FIRST ---
        this.removeBrickAt(oldRowIdx, colIdx);
        this.addBrickAt(targetRowIdx, colIdx);

        // --- LEARNED RULE: SMOOTHED FRONTIER TERRITORY ---
        const getColumnSpine = (c) => {
            const colBricks = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === c);
            if (colBricks.length === 0) return this.baselineMiddleRow;
            const rows = colBricks.map(b => b.rowCoordinate);
            return (ballSide === 'top') ? Math.max(...rows) : Math.min(...rows);
        };

        const samplingRange = 2;
        let sum = 0, count = 0;
        for (let i = -samplingRange; i <= samplingRange; i++) {
            sum += getColumnSpine(colIdx + i);
            count++;
        }
        const smoothedFrontier = sum / count;

        const isRowInOpponentVoid = (r) => {
            return (ballSide === 'top') ? (r > smoothedFrontier) : (r < smoothedFrontier);
        };

        // --- PASS 1: CONDITIONAL GROWTH (Learnedmass) ---
        if (isRowInOpponentVoid(targetRowIdx)) {
            const parity = Math.abs(targetRowIdx) % 2;
            const mortarPartnerCol = (parity === 0) ? colIdx + 1 : colIdx - 1;
            this.addBrickAt(targetRowIdx, mortarPartnerCol);
        }
        if (isRowInOpponentVoid(oldRowIdx)) {
            this.addBrickAt(oldRowIdx, colIdx - 1);
            this.addBrickAt(oldRowIdx, colIdx + 1);
        }

        // --- PASS 3: LEARNED SPINAL STITCHING ---
        this.performSpinalStitching();

        // --- PASS 4: LEARNED PRUNING ---
        this.sanitizeRibbon();
    }

    performSpinalStitching() {
        const screenW = this.canvas.clientWidth || 800;
        const lBound = Math.floor(-150 / this.columnSpacing);
        const rBound = Math.ceil((screenW + 150) / this.columnSpacing);

        // Bi-directional iterative stabilization
        for (let pass = 0; pass < 3; pass++) {
            for (let c = lBound; c < rBound; c++) this.stitchGap(c, c + 1);
            for (let c = rBound; c > lBound; c--) this.stitchGap(c - 1, c);
        }
    }

    stitchGap(colA, colB) {
        const bricksA = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === colA);
        const bricksB = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === colB);

        // 1. Column Restoration
        if (bricksA.length === 0 && bricksB.length > 0) {
            this.addBrickAt(bricksB[0].rowCoordinate, colA); return;
        }
        if (bricksB.length === 0 && bricksA.length > 0) {
            this.addBrickAt(bricksA[0].rowCoordinate, colB); return;
        }
        if (bricksA.length === 0 || bricksB.length === 0) return;

        // 2. Find closest pair to connect
        let bestA = null, bestB = null, minRowDist = Infinity;
        for (const a of bricksA) {
            for (const b of bricksB) {
                const dist = Math.abs(a.rowCoordinate - b.rowCoordinate);
                if (dist < minRowDist) { minRowDist = dist; bestA = a; bestB = b; }
            }
        }

        // 3. Learned Handshake Seal
        const handOfA = this.getMasonryNeighbors(bestA.rowCoordinate, bestA.columnCoordinate);
        const isConnected = handOfA.some(([nr, nc]) => nc === colB && this.activeBrickMap.has(`${nc},${nr}`));

        if (!isConnected) {
            // Build vertical staircase in Column A to reach Column B's target
            const stepDir = (bestB.rowCoordinate > bestA.rowCoordinate) ? 1 : -1;
            let cursorR = bestA.rowCoordinate;
            for (let i = 0; i < 40; i++) {
                cursorR += stepDir;
                this.addBrickAt(cursorR, colA);
                const updatedHand = this.getMasonryNeighbors(cursorR, colA);
                if (updatedHand.some(([nr, nc]) => nc === colB && this.activeBrickMap.has(`${nc},${nr}`))) break;
                if (Math.abs(cursorR - bestB.rowCoordinate) < 0.5) break;
            }
        }
    }

    sanitizeRibbon() {
        // --- PASS 4: THICKNESS PRUNING (Connectivity-First) ---
        const columns = new Map();
        for (const b of this.activeBrickMap.values()) {
            if (!columns.has(b.columnCoordinate)) columns.set(b.columnCoordinate, []);
            columns.get(b.columnCoordinate).push(b);
        }

        const vitalKeys = new Set();
        for (const [colIdx, bricks] of columns.entries()) {
            const handshakeRows = [];
            for (const b of bricks) {
                const nh = this.getMasonryNeighbors(b.rowCoordinate, b.columnCoordinate);
                if (nh.some(([nr, nc]) => nc !== colIdx && this.activeBrickMap.has(`${nc},${nr}`))) {
                    handshakeRows.push(b.rowCoordinate);
                }
            }

            if (handshakeRows.length > 0) {
                const firstHandshake = Math.min(...handshakeRows);
                const lastHandshake = Math.max(...handshakeRows);
                // Preserve the 2-brick vertical stack at elbows (the user's 'Learned Rule')
                bricks.forEach(b => {
                    if (b.rowCoordinate >= firstHandshake && b.rowCoordinate <= lastHandshake) {
                        vitalKeys.add(`${colIdx},${b.rowCoordinate}`);
                    }
                });
            } else {
                vitalKeys.add(`${colIdx},${bricks[0].rowCoordinate}`); // Edge safety
            }
        }

        for (const k of this.activeBrickMap.keys()) if (!vitalKeys.has(k)) this.activeBrickMap.delete(k);

        // --- PASS 5: ORPHAN CLEANUP ---
        const removalList = [];
        for (const [key, b] of this.activeBrickMap.entries()) {
            let neighborCount = 0;
            this.getMasonryNeighbors(b.rowCoordinate, b.columnCoordinate).forEach(([nr, nc]) => {
                if (this.activeBrickMap.has(`${nc},${nr}`)) neighborCount++;
            });
            const safetyBuffer = 100;
            const screenW = this.canvas.clientWidth || 800;
            const leftL = Math.floor(-safetyBuffer / this.columnSpacing);
            const rightL = Math.ceil((screenW + safetyBuffer) / this.columnSpacing);
            if (neighborCount < 1 && b.columnCoordinate > leftL && b.columnCoordinate < rightL) removalList.push(key);
        }
        removalList.forEach(k => this.activeBrickMap.delete(k));
    }

    update(game) {
        const lowestRowLimit = Math.floor(game.height / this.brickHeight) - 2;
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate < 4) b.rowCoordinate = 4;
            if (b.rowCoordinate > lowestRowLimit) b.rowCoordinate = lowestRowLimit;
            b.updateVisualPosition();
        }
    }

    checkCollision(ball) {
        // GHOST GASKET: 40px internal half-width (80px total) seals masonry gaps forever
        const shieldBoundX = 40 + ball.radius;
        const shieldBoundY = (this.brickHeight / 2) + ball.radius + 2;

        let winner = null;
        let bestDx = Infinity;

        for (const b of this.activeBrickMap.values()) {
            const dx = ball.x - b.canvasXPosition;
            const dy = ball.y - b.canvasYPosition;

            if (Math.abs(dx) < shieldBoundX && Math.abs(dy) < shieldBoundY) {
                const headingToWall = (ball.side === 'top' && ball.vy > 0) || (ball.side === 'bottom' && ball.vy < 0);
                if (headingToWall || Math.abs(dy) < 10) {
                    if (Math.abs(dx) < bestDx) {
                        bestDx = Math.abs(dx);
                        winner = b;
                    }
                }
            }
        }

        if (winner) {
            this.processWallImpact(winner, ball.side);
            ball.vy *= -1;
            // 24px Ejection clears the newly stitched frontier
            const ejectionClearance = (this.brickHeight / 2) + ball.radius + 24;
            ball.y = (ball.y > winner.canvasYPosition) ? winner.canvasYPosition + ejectionClearance : winner.canvasYPosition - ejectionClearance;
            return true;
        }
        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;

        for (const brick of this.activeBrickMap.values()) {
            const rx = brick.canvasXPosition - brick.width / 2;
            const ry = brick.canvasYPosition - brick.height / 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(rx, ry, brick.width, brick.height, 4);
            else ctx.rect(rx, ry, brick.width, brick.height);
            ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    }
}
