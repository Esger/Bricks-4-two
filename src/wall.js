export class Brick {
    constructor(rowCoordinate, columnCoordinate, height) {
        this.rowCoordinate = Math.round(rowCoordinate);
        this.columnCoordinate = Math.round(columnCoordinate);
        this.width = 60; // Clean non-overlapping width
        this.height = height;
        this.updateVisualPosition();
    }

    updateVisualPosition() {
        const standardColumnWidth = 60;
        const staggeredRowOffset = 30; // 50% aside jump for masonry

        // Every second row is offset by 30px to create the staggered grid
        const rowParity = Math.abs(this.rowCoordinate) % 2;
        const xOffset = (rowParity === 1) ? staggeredRowOffset : 0;

        this.canvasXPosition = (this.columnCoordinate * standardColumnWidth) + xOffset;
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

        const screenWidth = this.canvas.clientWidth || 800;
        const startColumnIdx = Math.floor(-120 / this.columnSpacing);
        const endColumnIdx = Math.ceil((screenWidth + 120) / this.columnSpacing);
        this.baselineMiddleRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);

        // Build the initial flat ribbon (exactly one brick per column)
        for (let col = startColumnIdx; col <= endColumnIdx; col++) {
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

    getNeighborCoordinates(row, col) {
        const parity = Math.abs(row) % 2;
        // Staggered grid 6-neighbor rules
        const points = [[row, col - 1], [row, col + 1]]; // Side handshakes
        if (parity === 0) { // Even row touches same and left-shift
            points.push([row - 1, col], [row - 1, col - 1], [row + 1, col], [row + 1, col - 1]);
        } else { // Odd row touches same and right-shift
            points.push([row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]);
        }
        return points;
    }

    // THE TOPOLOGICAL RIBBON ENGINE (Surgical 5-Pass Algorithm)
    processWallImpact(hitBrick, ballSide) {
        const oldRow = hitBrick.rowCoordinate;
        const colIdx = hitBrick.columnCoordinate;
        const pushDir = (ballSide === 'top' ? 1 : -1);
        const targetRow = oldRow + pushDir;

        // --- DEFINE TERRITORY ---
        // Opponent Territory is the 'Void' behind the wall.
        const getColumnFrontier = (c) => {
            const bricks = [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === c);
            if (bricks.length === 0) return this.baselineMiddleRow;
            const rows = bricks.map(b => b.rowCoordinate);
            return (ballSide === 'top') ? Math.max(...rows) : Math.min(...rows);
        };

        const isPointInOpponentVoid = (r, c) => {
            const frontier = getColumnFrontier(c);
            return (ballSide === 'top') ? (r > frontier) : (r < frontier);
        };

        const touchesOpponentVoid = (r, c) => {
            const neighbors = this.getNeighborCoordinates(r, c);
            return neighbors.some(([nr, nc]) => isPointInOpponentVoid(nr, nc));
        };

        // --- PASS 1: GROWTH (Conditional Reinforcement) ---
        // 1. Move the primary brick
        this.addBrickAt(targetRow, colIdx);

        // 2. Add 'Mortar Partner' (Two-Behind) only if it touches void
        if (touchesOpponentVoid(targetRow, colIdx)) {
            const targetParity = Math.abs(targetRow) % 2;
            const mortarCol = (targetParity === 0) ? colIdx + 1 : colIdx - 1;
            this.addBrickAt(targetRow, mortarCol);
        }

        // 3. Add 'Two to the Sides' only if they touch void
        if (touchesOpponentVoid(oldRow, colIdx - 1)) this.addBrickAt(oldRow, colIdx - 1);
        if (touchesOpponentVoid(oldRow, colIdx + 1)) this.addBrickAt(oldRow, colIdx + 1);

        // 4. Seal all gaps (Vertical Staircase) - Guaranteed Airtightness
        this.bridgeVerticalJoint(colIdx - 1, colIdx);
        this.bridgeVerticalJoint(colIdx, colIdx + 1);

        // --- PASS 2: REMOVE HIT BRICK ---
        this.removeBrickAt(oldRow, colIdx);

        // --- PASS 4 & 5: PRUNING ---
        this.performRibbonSanitization();
    }

    bridgeVerticalJoint(colA, colB) {
        const getColumnBricks = (c) => [...this.activeBrickMap.values()].filter(b => b.columnCoordinate === c);
        const bricksA = getColumnBricks(colA);
        const bricksB = getColumnBricks(colB);
        if (bricksA.length === 0 || bricksB.length === 0) return;

        // Check if any A brick touches any B brick
        let connected = false;
        for (const a of bricksA) {
            const neighbors = this.getNeighborCoordinates(a.rowCoordinate, a.columnCoordinate);
            if (neighbors.some(([nr, nc]) => nc === colB && this.activeBrickMap.has(`${nc},${nr}`))) {
                connected = true; break;
            }
        }

        if (!connected) {
            // Build vertical path in Col A to meet Col B
            const anchorA = bricksA[0];
            const anchorB = bricksB[0];
            const step = (anchorB.rowCoordinate > anchorA.rowCoordinate) ? 1 : -1;
            let current = anchorA.rowCoordinate;
            while (Math.abs(current - anchorB.rowCoordinate) > 1) {
                current += step;
                this.addBrickAt(current, colA);
            }
        }
    }

    performRibbonSanitization() {
        // --- PASS 4: THICKNESS PRUNING (Strict 1D Chain) ---
        const columnMap = new Map();
        for (const brick of this.activeBrickMap.values()) {
            if (!columnMap.has(brick.columnCoordinate)) columnMap.set(brick.columnCoordinate, []);
            columnMap.get(brick.columnCoordinate).push(brick);
        }

        const keepSet = new Set();
        for (const [col, bricks] of columnMap.entries()) {
            // Find handshake points to neighbors
            const handshakes = [];
            for (const b of bricks) {
                const neighbors = this.getNeighborCoordinates(b.rowCoordinate, b.columnCoordinate);
                if (neighbors.some(([nr, nc]) => nc !== col && this.activeBrickMap.has(`${nc},${nr}`))) {
                    handshakes.push(b.rowCoordinate);
                }
            }

            if (handshakes.length > 0) {
                const minH = Math.min(...handshakes);
                const maxH = Math.max(...handshakes);
                bricks.forEach(b => { if (b.rowCoordinate >= minH && b.rowCoordinate <= maxH) keepSet.add(`${col},${b.rowCoordinate}`); });
            } else {
                keepSet.add(`${col},${bricks[0].rowCoordinate}`); // Protect isolated edge
            }
        }

        for (const key of this.activeBrickMap.keys()) {
            if (!keepSet.has(key)) this.activeBrickMap.delete(key);
        }

        // --- PASS 5: ORPHAN CLEANUP ---
        const toDelete = [];
        for (const [key, b] of this.activeBrickMap.entries()) {
            let n = 0;
            this.getNeighborCoordinates(b.rowCoordinate, b.columnCoordinate).forEach(([nr, nc]) => {
                if (this.activeBrickMap.has(`${nc},${nr}`)) n++;
            });
            // Boundary safety
            const limit = 60;
            const leftL = Math.floor(-limit / this.columnSpacing);
            const rightL = Math.ceil((this.canvas.clientWidth + limit) / this.columnSpacing);
            if (n < 1 && b.columnCoordinate > leftL && b.columnCoordinate < rightL) toDelete.push(key);
        }
        toDelete.forEach(k => this.activeBrickMap.delete(k));
    }

    update(game) {
        // Enforce physical constraints
        const lowestRow = Math.floor(game.height / this.brickHeight) - 3;
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate < 4) b.rowCoordinate = 4;
            if (b.rowCoordinate > lowestRow) b.rowCoordinate = lowestRow;
            b.updateVisualPosition();
        }
    }

    checkCollision(ball) {
        // GHOST SHIELD: 31px internal width (62px total) for airtight physics
        const radiusX = 31 + ball.radius;
        const radiusY = (this.brickHeight / 2) + ball.radius + 2;

        let bestTarget = null;
        let minDx = Infinity;

        for (const brick of this.activeBrickMap.values()) {
            const dx = ball.x - brick.canvasXPosition;
            const dy = ball.y - brick.canvasYPosition;

            if (Math.abs(dx) < radiusX && Math.abs(dy) < radiusY) {
                const approaching = (ball.side === 'top' && ball.vy > 0) || (ball.side === 'bottom' && ball.vy < 0);
                if (approaching || Math.abs(dy) < 10) {
                    if (Math.abs(dx) < minDx) {
                        minDx = Math.abs(dx);
                        bestTarget = brick;
                    }
                }
            }
        }

        if (bestTarget) {
            this.processWallImpact(bestTarget, ball.side);
            const relativeDy = ball.y - bestTarget.canvasYPosition;
            ball.vy *= -1;
            const clearance = (this.brickHeight / 2) + ball.radius + 15;
            ball.y = (relativeDy > 0) ? bestTarget.canvasYPosition + clearance : bestTarget.canvasYPosition - clearance;
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
