export class Brick {
    constructor(rowCoordinate, columnCoordinate, height) {
        this.rowCoordinate = Math.round(rowCoordinate);
        this.columnCoordinate = Math.round(columnCoordinate);
        this.width = 60; // Clean non-overlapping grid width
        this.height = height;
        this.updateCanvasPosition();
    }

    updateCanvasPosition() {
        const standardColumnWidth = 60;
        const staggeredRowOffset = 30; // 50% aside jump for masonry

        // Every second row is offset by 30px to create the staggered grid
        const rowRemainder = Math.abs(this.rowCoordinate) % 2;
        const horizontalShift = (rowRemainder === 1) ? staggeredRowOffset : 0;

        this.canvasXPosition = (this.columnCoordinate * standardColumnWidth) + horizontalShift;
        this.canvasYPosition = (this.rowCoordinate * this.height);
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.brickWidth = 60;
        this.brickHeight = 25;
        this.columnSpacing = 60;

        // Logical state: The collection of bricks currently forming the ribbon
        this.activeBrickMap = new Map(); // Key: 'column,row' -> Brick object

        this.initializeWall();
    }

    initializeWall() {
        this.activeBrickMap.clear();

        const screenWidthForCoverage = this.canvas.clientWidth || 800;
        const firstVisibleCol = Math.floor(-120 / this.columnSpacing);
        const lastVisibleCol = Math.ceil((screenWidthForCoverage + 120) / this.columnSpacing);
        this.baselineMiddleRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);

        // Build the initial flat ribbon (exactly one brick per column)
        for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
            this.addBrickToMap(this.baselineMiddleRow, col);
        }
    }

    addBrickToMap(row, col) {
        const key = `${col},${row}`;
        if (this.activeBrickMap.has(key)) return;
        this.activeBrickMap.set(key, new Brick(row, col, this.brickHeight));
    }

    removeBrickFromMap(row, col) {
        this.activeBrickMap.delete(`${col},${row}`);
    }

    getTouchingNeighborCoords(row, col) {
        const parity = Math.abs(row) % 2;
        // In a staggered grid, a brick touches 2 sides and 4 diagonal/top-bottom neighbors
        const neighborCoords = [[row, col - 1], [row, col + 1]]; // Side neighbors

        if (parity === 0) { // Even row touches same and left-shift neighbors
            neighborCoords.push([row - 1, col], [row - 1, col - 1], [row + 1, col], [row + 1, col - 1]);
        } else { // Odd row touches same and right-shift neighbors
            neighborCoords.push([row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]);
        }
        return neighborCoords;
    }

    // THE TOPOLOGICAL RIBBON ENGINE (Surgical 5-Pass Algorithm)
    processWallImpact(hitBrick, ballSide) {
        const oldRowIndex = hitBrick.rowCoordinate;
        const colIndex = hitBrick.columnCoordinate;
        const pushDirection = (ballSide === 'top' ? 1 : -1);
        const targetRowIndex = oldRowIndex + pushDirection;

        // --- TERRITORY LOGIC ---
        // Support shell is only added if moving into or touching opponent's space.
        const isTargetInOpponentTerritory = (ballSide === 'top') ?
            (targetRowIndex >= this.baselineMiddleRow) :
            (targetRowIndex <= this.baselineMiddleRow);

        // --- PASS 1: GROWTH (Surgical Shell) ---
        // 1. Add the primary moved brick
        this.addBrickToMap(targetRowIndex, colIndex);

        if (isTargetInOpponentTerritory) {
            // 2. Add 'Two Behind in Mortar Pattern' (partners at target level that overlap the old footprint)
            const targetParity = Math.abs(targetRowIndex) % 2;
            const mortarPartnerCol = (targetParity === 0) ? colIndex + 1 : colIndex - 1;
            this.addBrickToMap(targetRowIndex, mortarPartnerCol);

            // 3. Add 'Two to the Sides' in the ORIGINAL row to ensure horizontal integrity
            this.addBrickToMap(oldRowIndex, colIndex - 1);
            this.addBrickToMap(oldRowIndex, colIndex + 1);
        }

        // 4. Fill gaps that arose (Vertical handshakes)
        this.sealGapsAroundColumn(colIndex);
        this.sealGapsAroundColumn(colIndex - 1);
        this.sealGapsAroundColumn(colIndex + 1);

        // --- PASS 2: REMOVE HIT BRICK (The surgery) ---
        this.removeBrickFromMap(oldRowIndex, colIndex);

        // --- PASS 4 & 5: PRUNING & ORPHAN CLEANUP ---
        this.performRibbonThinning();
    }

    sealGapsAroundColumn(col) {
        // Find bricks in this column and next neighbor to check connectivity
        const myBricks = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === col);
        const neighborBricks = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === col + 1);
        if (myBricks.length === 0 || neighborBricks.length === 0) return;

        let hasJoint = false;
        for (const me of myBricks) {
            const potentialJoints = this.getTouchingNeighborCoords(me.rowCoordinate, me.columnCoordinate);
            for (const [nr, nc] of potentialJoints) {
                if (nc === col + 1 && this.activeBrickMap.has(`${nc},${nr}`)) {
                    hasJoint = true;
                    break;
                }
            }
        }

        if (!hasJoint) {
            // Build a vertical bridge in this column to reach the neighbor's height
            const anchorA = myBricks[0];
            const anchorB = neighborBricks[0];
            const bridgeStep = (anchorB.rowCoordinate > anchorA.rowCoordinate) ? 1 : -1;
            let current = anchorA.rowCoordinate;
            while (Math.abs(current - anchorB.rowCoordinate) > 1) {
                current += bridgeStep;
                this.addBrickToMap(current, col);
            }
        }
    }

    performRibbonThinning() {
        // --- PASS 4: THICKNESS PRUNING (Strict 1D Linker) ---
        // For every vertical column, keep only the bricks spanning the required handshakes.
        const columnMap = new Map();
        for (const brick of this.activeBrickMap.values()) {
            if (!columnMap.has(brick.columnCoordinate)) columnMap.set(brick.columnCoordinate, []);
            columnMap.get(brick.columnCoordinate).push(brick);
        }

        const keepKeysSet = new Set();
        for (const [col, bricks] of columnMap.entries()) {
            const handshakeRows = [];
            for (const b of bricks) {
                const neighbours = this.getTouchingNeighborCoords(b.rowCoordinate, b.columnCoordinate);
                for (const [nr, nc] of neighbours) {
                    if (nc !== col && this.activeBrickMap.has(`${nc},${nr}`)) {
                        handshakeRows.push(b.rowCoordinate);
                        break;
                    }
                }
            }

            if (handshakeRows.length > 0) {
                const minR = Math.min(...handshakeRows);
                const maxR = Math.max(...handshakeRows);
                for (const b of bricks) {
                    if (b.rowCoordinate >= minR && b.rowCoordinate <= maxR) {
                        keepKeysSet.add(`${col},${b.rowCoordinate}`);
                    }
                }
            } else {
                // Protect lone head/tail bricks
                keepKeysSet.add(`${col},${bricks[0].rowCoordinate}`);
            }
        }

        for (const key of this.activeBrickMap.keys()) {
            if (!keepKeysSet.has(key)) this.activeBrickMap.delete(key);
        }

        // --- PASS 5: ORPHAN CLEANUP ---
        const toDeleteKeys = [];
        for (const [key, brick] of this.activeBrickMap.entries()) {
            let neighborCount = 0;
            const pts = this.getTouchingNeighborCoords(brick.rowCoordinate, brick.columnCoordinate);
            for (const [r, c] of pts) if (this.activeBrickMap.has(`${c},${r}`)) neighborCount++;

            // Do not delete bricks at screen edges
            const screenW = this.canvas.clientWidth || 800;
            const leftEdgeIdx = Math.floor(-60 / this.columnSpacing);
            const rightEdgeIdx = Math.ceil((screenW + 60) / this.columnSpacing);

            if (neighborCount < 1 && brick.columnCoordinate > leftEdgeIdx && brick.columnCoordinate < rightEdgeIdx) {
                toDeleteKeys.push(key);
            }
        }
        for (const k of toDeleteKeys) this.activeBrickMap.delete(k);
    }

    update(game) {
        // Safety row bounds
        const maxVerticalLimit = Math.floor(game.height / this.brickHeight) - 2;
        for (const brick of this.activeBrickMap.values()) {
            if (brick.rowCoordinate < 4) brick.rowCoordinate = 4;
            if (brick.rowCoordinate > maxVerticalLimit) brick.rowCoordinate = maxVerticalLimit;
            brick.updateCanvasPosition();
        }
    }

    checkCollision(ball) {
        // GHOST SHIELD: 30.5px internal width (61px total) for airtight physics
        const contactRadiusX = 30.5 + ball.radius;
        const contactRadiusY = (this.brickHeight / 2) + ball.radius + 2;

        let bestHitCandidate = null;
        let shortestDistX = Infinity;

        for (const brick of this.activeBrickMap.values()) {
            const dx = ball.x - brick.canvasXPosition;
            const dy = ball.y - brick.canvasYPosition;

            if (Math.abs(dx) < contactRadiusX && Math.abs(dy) < contactRadiusY) {
                const isHeadingTowardsWall = (ball.side === 'top' && ball.vy > 0) ||
                    (ball.side === 'bottom' && ball.vy < 0);

                if (isHeadingTowardsWall || Math.abs(dy) < 10) {
                    if (Math.abs(dx) < shortestDistX) {
                        shortestDistX = Math.abs(dx);
                        bestHitCandidate = brick;
                    }
                }
            }
        }

        if (bestHitCandidate) {
            // APPLYING THE USER'S 5-PASS SURGICAL ALGORITHM
            this.processWallImpact(bestHitCandidate, ball.side);

            // Physics Bounce
            const target = bestHitCandidate;
            const relativeDy = ball.y - target.canvasYPosition;
            ball.vy *= -1;

            // Precise Ejection (15px) prevents clipping
            const ejectionClearance = (this.brickHeight / 2) + ball.radius + 15;
            ball.y = relativeDy > 0 ? target.canvasYPosition + ejectionClearance : target.canvasYPosition - ejectionClearance;

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
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
