export class Brick {
    constructor(row, column, height) {
        this.row = Math.round(row);
        this.column = Math.round(column);
        this.width = 60; // Clean grid width
        this.height = height;
        this.updateCanvasPosition();
    }

    updateCanvasPosition() {
        const standardWidth = 60;
        const staggerShiftValue = 30; // 50% aside jump for masonry

        // Stagger logic: Every odd row is offset by 30px
        const rowParity = Math.abs(this.row) % 2;
        const horizontalOffset = (rowParity === 1) ? staggerShiftValue : 0;

        this.canvasXPosition = (this.column * standardWidth) + horizontalOffset;
        this.canvasYPosition = (this.row * this.height);
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.brickWidth = 60;
        this.brickHeight = 25;
        this.columnSpacing = 60;

        // Primary State: A Map of logical positions to Brick objects
        this.activeBricksMap = new Map(); // Key: 'column,row' -> Brick object

        this.initializeWall();
    }

    initializeWall() {
        this.activeBricksMap.clear();
        const screenWidth = this.canvas.clientWidth || 800;
        const firstVisibleCol = Math.floor(-120 / this.columnSpacing);
        const lastVisibleCol = Math.ceil((screenWidth + 120) / this.columnSpacing);
        const baselineRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);

        // Build initial flat ribbon
        for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
            this.addBrickToMap(baselineRow, col);
        }
    }

    addBrickToMap(row, col) {
        const key = `${col},${row}`;
        if (this.activeBricksMap.has(key)) return;
        this.activeBricksMap.set(key, new Brick(row, col, this.brickHeight));
    }

    removeBrickFromMap(row, col) {
        this.activeBricksMap.delete(`${col},${row}`);
    }

    getTouchingNeighbors(row, col) {
        const parity = Math.abs(row) % 2;
        const neighbors = [[row, col - 1], [row, col + 1]]; // Horizontal

        // Vertical neighbors in staggered grid
        if (parity === 0) { // Even touches same and left-shift
            neighbors.push([row - 1, col], [row - 1, col - 1], [row + 1, col], [row + 1, col - 1]);
        } else { // Odd touches same and right-shift
            neighbors.push([row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]);
        }
        return neighbors;
    }

    // THE TOPOLOGICAL RIBBON ENGINE (Surgical 5-Pass Algorithm)
    processImpact(hitBrick, ballSide) {
        const oldRow = hitBrick.row;
        const colIdx = hitBrick.column;
        const pushDir = (ballSide === 'top' ? 1 : -1);
        const targetRowIndex = oldRow + pushDir;

        // --- PASS 1: GROWTH (Support Shell & Mortar) ---
        // 1. Add the moved brick
        this.addBrickToMap(targetRowIndex, colIdx);

        // 2. Add "Two Behind in Mortar Pattern"
        // These are the bricks in the target row that overlap the old footprint
        const oldParity = Math.abs(oldRow) % 2;
        const mortarPartnerCol = (oldParity === 0) ? colIdx - 1 : colIdx + 1;
        this.addBrickToMap(targetRowIndex, mortarPartnerCol);

        // 3. Add "Two to the Sides"
        this.addBrickToMap(targetRowIndex, colIdx - 1);
        this.addBrickToMap(targetRowIndex, colIdx + 1);

        // 4. "Fill Gaps that arose" (Airtight Stitching)
        // Ensure connectivity between neighbors in the affected area
        for (let c = colIdx - 1; c <= colIdx; c++) {
            this.bridgeVerticalGapBetweenColumns(c, c + 1);
        }

        // --- PASS 2: REMOVE HIT BRICK (The surgery) ---
        this.removeBrickFromMap(oldRow, colIdx);

        // --- PASS 3: Deduplication (Map-based) ---

        // --- PASS 4 & 5: PRUNING & ORPHAN CLEANUP ---
        this.performRibbonSanitization();
    }

    bridgeVerticalGapBetweenColumns(colA, colB) {
        // Find bricks in each column
        const bricksA = [...this.activeBricksMap.values()].filter(b => b.column === colA);
        const bricksB = [...this.activeBricksMap.values()].filter(b => b.column === colB);
        if (bricksA.length === 0 || bricksB.length === 0) return;

        // Check if any A brick touches any B brick
        let isConnected = false;
        for (const a of bricksA) {
            const neighbors = this.getTouchingNeighbors(a.row, a.column);
            for (const [nr, nc] of neighbors) {
                if (this.activeBricksMap.has(`${nc},${nr}`)) isConnected = true;
            }
        }

        // If not connected, add bridge bricks in Col A to reach the nearest Col B brick
        if (!isConnected) {
            bricksA.sort((x, y) => x.row - y.row);
            bricksB.sort((x, y) => x.row - y.row);
            const anchorA = bricksA[0];
            const anchorB = bricksB[0];
            const step = (anchorB.row > anchorA.row) ? 1 : -1;
            let current = anchorA.row;
            while (Math.abs(current - anchorB.row) > 1) {
                current += step;
                this.addBrickToMap(current, colA);
            }
        }
    }

    performRibbonSanitization() {
        // --- PASS 4: THICKNESS PRUNING (Strict 1D Limit) ---
        // For every column, keep only the bricks that connect to neighbors
        const columnMap = new Map();
        for (const brick of this.activeBricksMap.values()) {
            if (!columnMap.has(brick.column)) columnMap.set(brick.column, []);
            columnMap.get(brick.column).push(brick);
        }

        const bricksToKeepKeys = new Set();
        for (const [col, bricks] of columnMap.entries()) {
            // Bricks in this column that have neighbors in col-1 or col+1
            const connectionRows = [];
            for (const b of bricks) {
                const neighbors = this.getTouchingNeighbors(b.row, b.column);
                let touchesNextColumn = false;
                for (const [nr, nc] of neighbors) {
                    if (nc !== col && this.activeBricksMap.has(`${nc},${nr}`)) {
                        touchesNextColumn = true;
                        break;
                    }
                }
                if (touchesNextColumn) connectionRows.push(b.row);
            }

            if (connectionRows.length > 0) {
                const minR = Math.min(...connectionRows);
                const maxR = Math.max(...connectionRows);
                // Keep the vertical segment connecting these points
                for (const b of bricks) {
                    if (b.row >= minR && b.row <= maxR) bricksToKeepKeys.add(`${col},${b.row}`);
                }
            } else {
                // If no connections, it might be a head/tail spine; keep at least one
                const avgRow = Math.round(bricks.reduce((sum, b) => sum + b.row, 0) / bricks.length);
                bricksToKeepKeys.add(`${col},${avgRow}`);
            }
        }

        // Wipe everything not flagged as essential 1D ribbon
        for (const key of this.activeBricksMap.keys()) {
            if (!bricksToKeepKeys.has(key)) this.activeBricksMap.delete(key);
        }

        // --- PASS 5: ORPHAN CLEANUP ---
        const removalCandidates = [];
        for (const [key, brick] of this.activeBricksMap.entries()) {
            let n = 0;
            const pts = this.getTouchingNeighbors(brick.row, brick.column);
            for (const [r, c] of pts) if (this.activeBricksMap.has(`${c},${r}`)) n++;

            // Protected edges
            const screenW = this.canvas.clientWidth || 800;
            const leftEdgeIdx = Math.floor(-60 / this.columnSpacing);
            const rightEdgeIdx = Math.ceil((screenW + 60) / this.columnSpacing);

            if (n < 1 && brick.column > leftEdgeIdx && brick.column < rightEdgeIdx) {
                removalCandidates.push(key);
            }
        }
        for (const k of removalCandidates) this.activeBricksMap.delete(k);
    }

    update(game) {
        // Enforce boundary safety
        const lowestRowOnScreen = Math.floor(game.height / this.brickHeight) - 3;
        for (const brick of this.activeBricksMap.values()) {
            if (brick.row < 4) brick.row = 4;
            if (brick.row > lowestRowOnScreen) brick.row = lowestRowOnScreen;
            brick.updateCanvasPosition();
        }
    }

    checkCollision(ball) {
        // GHOST SHIELD: 30.5px internal width (61px total) for airtight physics
        const contactRadiusX = 30.5 + ball.radius;
        const contactRadiusY = (this.brickHeight / 2) + ball.radius + 2;

        let bestTargetInstance = null;
        let minimumDxValue = Infinity;

        for (const brick of this.activeBricksMap.values()) {
            const dx = ball.x - brick.canvasXPosition;
            const dy = ball.y - brick.canvasYPosition;

            if (Math.abs(dx) < contactRadiusX && Math.abs(dy) < contactRadiusY) {
                const ballMovingToWall = (ball.side === 'top' && ball.vy > 0) ||
                    (ball.side === 'bottom' && ball.vy < 0);

                if (ballMovingToWall || Math.abs(dy) < 10) {
                    if (Math.abs(dx) < minimumDxValue) {
                        minimumDxValue = Math.abs(dx);
                        bestTargetInstance = brick;
                    }
                }
            }
        }

        if (bestTargetInstance) {
            // SURGICAL PROCESS: Applying your 5-Pass Algorithm
            this.processImpact(bestTargetInstance, ball.side);

            // Physics Bounce
            const target = bestTargetInstance;
            const relativeOffsetV = ball.y - target.canvasYPosition;
            ball.vy *= -1;

            // Critical Ejection Clearance (15px)
            const clearanceDistance = (this.brickHeight / 2) + ball.radius + 15;
            ball.y = relativeOffsetV > 0 ? target.canvasYPosition + clearanceDistance : target.canvasYPosition - clearanceDistance;

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

        for (const brick of this.activeBricksMap.values()) {
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
