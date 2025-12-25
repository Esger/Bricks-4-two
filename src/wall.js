export class Brick {
    constructor(rowCoordinate, columnCoordinate, height, width) {
        this.rowCoordinate = Math.round(rowCoordinate);
        this.columnCoordinate = Math.round(columnCoordinate);
        this.width = width || 60;
        this.height = height;
        this.isOrphan = false;
        this.updateVisualPosition();
    }

    updateVisualPosition() {
        const standardWidth = this.width;
        const staggerOffset = this.width / 2;
        const rowParity = Math.abs(this.rowCoordinate) % 2;
        const xOffset = (rowParity === 1) ? staggerOffset : 0;
        // Round to integer CSS pixels to avoid sub-pixel rendering seams
        this.canvasXPosition = Math.round((this.columnCoordinate * standardWidth) + xOffset);
        this.canvasYPosition = Math.round(this.rowCoordinate * this.height);
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.maxBrickWidth = 60;
        // Initialize brickWidth from max and ensure it's an integer
        this.brickWidth = this.maxBrickWidth;
        this.brickHeight = 25;
        this.columnSpacing = this.brickWidth;
        // Number of extra brick columns to add beyond the visible canvas on each side
        this.edgeBufferCols = 1;
        this.activeBrickMap = new Map();

        // Special brick config
        // Specials only appear when the wall auto-fills/repairs; they do NOT spawn on their own
        this.specialOnRepairChance = 0.06; // chance that an auto-added repair brick is special
        this.specialBorder = '#00ff88'; // visual border color for special bricks

        // --- ANCHOR STATE ---
        this.masterMinCol = 0;
        this.masterMaxCol = 0;

        // --- TRAINING STATE ---
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
            console.log("TRAINING PAUSED.");
            this.analyzeTopology();
        } else {
            const snapAfter = Array.from(this.activeBrickMap.keys()).sort().join(" | ");
            this.isDebugPaused = false;
            if (this.snapshotAtPause !== snapAfter) {
                console.log("%c TRAINING DELTA SAVED ", "background: #00ff88; color: #000; font-weight: bold;");
                console.log("Before: ", this.snapshotAtPause);
                console.log("After:  ", snapAfter);
            }
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

        // BFS from MASTER minCol to reach MASTER maxCol
        const startBricks = bricks.filter(b => b.columnCoordinate <= this.masterMinCol);
        if (startBricks.length === 0) return false;

        const queue = [...startBricks];
        const visited = new Set();

        queue.forEach(b => {
            visited.add(`${b.columnCoordinate},${b.rowCoordinate}`);
            b.isOrphan = false;
        });

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

        // Connectivity is only TRUE if we reached the master max column
        return bricks.some(b => b.columnCoordinate >= this.masterMaxCol && !b.isOrphan);
    }

    initializeWall() {
        this.activeBrickMap.clear();
        this.baselineMiddleRow = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);
        // Use CSS pixel width directly and fit an integer number of bricks to avoid cut-offs
        const screenW = this.canvas.clientWidth || 800;

        // Determine how many whole bricks would fit at the maximum brick width,
        const minBricks = Math.floor(screenW / this.maxBrickWidth);
        this.brickWidth = Math.max(1, Math.floor(screenW / minBricks));
        this.columnSpacing = this.brickWidth;

        this.masterMinCol = Math.floor(-150 / this.columnSpacing) - this.edgeBufferCols;
        this.masterMaxCol = Math.ceil((screenW + 150) / this.columnSpacing) + this.edgeBufferCols;
        for (let c = this.masterMinCol; c <= this.masterMaxCol; c++) {
            // Baseline starts with normal bricks only; specials appear when the wall auto-repairs during gameplay
            this.addBrickAt(this.baselineMiddleRow, c, null);
        }
        this.analyzeTopology();

        // Special-brick spawn cooldown setup
        this.specialCooldown = Math.floor(this.specialCooldownMin + Math.random() * (this.specialCooldownMax - this.specialCooldownMin)); // frames until possible next spawn
    }

    addBrickAt(row, col, type = null) {
        const key = `${col},${row}`;
        if (this.activeBrickMap.has(key)) return false;
        const b = new Brick(row, col, this.brickHeight, this.brickWidth);
        b.type = type; // e.g. 'extraBall'
        this.activeBrickMap.set(key, b);
        return true;
    }

    processWallImpact(hitBrick, ballSide) {
        const preKeys = new Set(this.activeBrickMap.keys());
        const hitR = hitBrick.rowCoordinate;
        const hitC = hitBrick.columnCoordinate;
        const delta = (ballSide === 'top' ? 1 : -1);

        this.lastImpactCol = hitC;
        this.lastImpactCoord = { row: hitR, col: hitC };

        // Record hit brick type so external systems can react after removal
        this.lastHitBrickType = hitBrick.type || null;
        this.lastHitBrickCoord = { row: hitR, col: hitC };

        // STEP 1: Remove hit brick immediately.
        this.activeBrickMap.delete(`${hitC},${hitR}`);

        // STEP 2: check connectivity (must reach MASTER boundaries).
        let isConnected = this.analyzeTopology();

        if (!isConnected && !hitBrick.isOrphan) {
            // MVR MODE (Individual Trials)
            const neighbors = this.getMasonryNeighbors(hitR, hitC);
            const mortarCandidates = neighbors.filter(([nr, nc]) => nr === (hitR + delta));

            // Priority: Mortar, Sides
            const candidates = [
                ...mortarCandidates,
                [hitR, hitC - 1],
                [hitR, hitC + 1]
            ];

            // A. Trial individual bricks
            for (const [cr, cc] of candidates) {
                const key = `${cc},${cr}`;
                if (this.activeBrickMap.has(key)) continue;

                // Small chance the trial brick becomes a special extraBall (only when auto-adding)
                const t = (Math.random() < (this.specialOnRepairChance || 0.06)) ? 'extraBall' : null;
                this.addBrickAt(cr, cc, t);
                isConnected = this.analyzeTopology();
                if (isConnected) break; // First individual success wins
                else this.activeBrickMap.delete(key); // Discard non-repairing clutter
            }

            // B. Trial collective fallback
            if (!isConnected) {
                for (const [cr, cc] of candidates) {
                    const t = (Math.random() < (this.specialOnRepairChance || 0.06)) ? 'extraBall' : null;
                    this.addBrickAt(cr, cc, t);
                    isConnected = this.analyzeTopology();
                    if (isConnected) break;
                }
            }
        }

        if (!isConnected) {
            console.error("STRUCTURAL INTEGRITY ERROR: Boundary path severed.");
        }

        const postKeys = new Set(this.activeBrickMap.keys());
        this.lastAuditAdded = [...postKeys].filter(k => !preKeys.has(k));
        this.lastAuditRemoved = [...preKeys].filter(k => !postKeys.has(k)).filter(k => k !== `${hitC},${hitR}`);
    }

    update(game) {
        if (this.isDebugPaused) return;
        const floor = Math.floor(game.height / this.brickHeight) - 2;
        for (const b of this.activeBrickMap.values()) {
            if (b.rowCoordinate < 4) b.rowCoordinate = 4;
            if (b.rowCoordinate > floor) b.rowCoordinate = floor;
            b.updateVisualPosition();
        }

        // No autonomous special spawning here — specials are only created when the wall auto-repairs to keep connectivity intact
        // (This keeps specials tied to gameplay actions.)
    }

    checkCollision(ball) {
        if (this.isDebugPaused) return false;
        let best = null, minPenetration = Infinity, bestPen = null;
        for (const b of this.activeBrickMap.values()) {
            const dx = ball.x - b.canvasXPosition, dy = ball.y - b.canvasYPosition;
            // Use a bounding box based on the actual brick size plus the ball radius
            const sX = (b.width / 2) + ball.radius + 2;
            const sY = (b.height / 2) + ball.radius + 2;
            if (Math.abs(dx) <= sX && Math.abs(dy) <= sY) {
                // Only collide if the ball is moving toward the brick vertically or already significantly overlapping,
                // but allow side collisions when horizontal penetration is evident
                const movingTowards = (ball.side === 'top' && ball.vy > 0) || (ball.side === 'bottom' && ball.vy < 0);
                const verticalOverlap = Math.abs(dy) < (ball.radius + 3);
                const overlapX = sX - Math.abs(dx);
                const overlapY = sY - Math.abs(dy);
                if (movingTowards || verticalOverlap || overlapX > 0.5) {
                    const penetration = Math.min(overlapX, overlapY);
                    if (penetration < minPenetration) {
                        minPenetration = penetration;
                        best = b;
                        bestPen = { dx, dy, overlapX, overlapY };
                    }
                }
            }
        }
        if (best) {
            this.processWallImpact(best, ball.side);

            // Decide collision axis by comparing penetration depths
            if (bestPen.overlapX < bestPen.overlapY) {
                // Side collision — reflect horizontally
                ball.vx *= -1;
                const ejectOffsetX = (best.width / 2) + ball.radius + 2;
                if (bestPen.dx > 0) ball.x = best.canvasXPosition + ejectOffsetX;
                else ball.x = best.canvasXPosition - ejectOffsetX;
            } else {
                // Vertical collision — reflect vertically
                const impactVy = ball.vy;
                ball.vy *= -1;
                const ejectOffsetY = (best.height / 2) + ball.radius + 2;
                if (impactVy > 0) ball.y = best.canvasYPosition - ejectOffsetY;
                else ball.y = best.canvasYPosition + ejectOffsetY;
            }

            // Preserve intended speed if set (paddle launches rely on gameSpeed)
            if (ball.gameSpeed) {
                const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
                ball.vx = (ball.vx / currentSpeed) * ball.gameSpeed;
                ball.vy = (ball.vy / currentSpeed) * ball.gameSpeed;
            }

            return true;
        }
        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        for (const [key, b] of this.activeBrickMap.entries()) {
            // Draw each brick slightly smaller to create a hairline gap between neighbors and avoid overlap
            const drawW = Math.max(1, b.width - 1);
            const drawH = Math.max(1, b.height - 1);
            const rx = Math.round(b.canvasXPosition - (drawW / 2));
            const ry = Math.round(b.canvasYPosition - (drawH / 2));

            // Visual treatment for special bricks
            if (b.type === 'extraBall') {
                ctx.shadowColor = b.isOrphan ? '#ff3e3e' : this.specialBorder || '#00ff88';
                ctx.fillStyle = b.isOrphan ? 'rgba(255, 62, 62, 0.3)' : 'rgba(0, 200, 80, 0.12)';
                ctx.strokeStyle = this.specialBorder || '#00ff88';
            } else if (this.isDebugPaused) {
                const isAutoAdd = this.lastAuditAdded.includes(key);
                if (isAutoAdd) {
                    ctx.shadowColor = '#00d0ff'; ctx.fillStyle = 'rgba(0, 208, 255, 0.4)'; ctx.strokeStyle = '#00d0ff';
                } else {
                    ctx.shadowColor = b.isOrphan ? '#ff3e3e' : '#00ff88';
                    ctx.fillStyle = b.isOrphan ? 'rgba(255, 62, 62, 0.3)' : 'rgba(0, 255, 136, 0.2)';
                    ctx.strokeStyle = b.isOrphan ? '#ff3e3e' : '#00ff88';
                }
            } else {
                ctx.shadowColor = b.isOrphan ? '#ff3e3e' : 'rgba(255,255,255,0.3)';
                ctx.fillStyle = b.isOrphan ? 'rgba(255, 62, 62, 0.2)' : 'rgba(255,255,255,0.15)';
                ctx.strokeStyle = b.isOrphan ? '#ff3e3e' : 'rgba(255,255,255,0.4)';
            }
            ctx.lineWidth = (b.type === 'extraBall') ? 2 : 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(rx, ry, drawW, drawH, 4);
            else ctx.rect(rx, ry, drawW, drawH);
            ctx.fill(); ctx.stroke();

            // Draw center icon for special bricks
            if (b.type === 'extraBall') {
                ctx.save();
                ctx.fillStyle = '#3ac47d';
                const r = Math.min(6, drawH / 3, drawW / 3);
                ctx.beginPath();
                ctx.arc(b.canvasXPosition, b.canvasYPosition, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        if (this.isDebugPaused) {
            if (this.lastImpactCoord) this.drawGhost(ctx, this.lastImpactCoord.row, this.lastImpactCoord.col, '#ff3e3e', [5, 5]);
            this.lastAuditRemoved.forEach(k => {
                const [c, r] = k.split(',').map(Number);
                this.drawGhost(ctx, r, c, 'rgba(255, 165, 0, 0.6)', [2, 2]);
            });
            ctx.fillStyle = '#00ff88'; ctx.font = 'bold 16px Montserrat'; ctx.textAlign = 'center';
            ctx.fillText("--- TRAINING PAUSED ---", this.canvas.width / 2, 50);
            ctx.font = '12px Montserrat'; ctx.fillText("Boundary-Aware Selective Mode Active. Wall must reach full screen width.", this.canvas.width / 2, 75);
        }
        ctx.restore();
    }

    drawGhost(ctx, row, col, color, dash = []) {
        const parity = Math.abs(row) % 2;
        const xShift = (parity === 1) ? (this.brickWidth / 2) : 0;
        const gx = (col * this.brickWidth) + xShift;
        const gy = row * this.brickHeight;
        ctx.save();
        ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 2;
        ctx.beginPath();
        const drawW = Math.max(1, this.brickWidth - 1);
        const drawH = Math.max(1, this.brickHeight - 1);
        const halfW = drawW / 2;
        const halfH = drawH / 2;
        if (ctx.roundRect) ctx.roundRect(gx - halfW, gy - halfH, drawW, drawH, 4);
        else ctx.rect(gx - halfW, gy - halfH, drawW, drawH);
        ctx.stroke();
        ctx.restore();
    }
}
