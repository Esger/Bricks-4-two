export class Brick {
    constructor(r, c, w, h) {
        this.r = Math.round(r);
        this.c = c;
        this.w = 60; // Standard visual width
        this.h = h;
        this.updatePos();
    }

    updatePos() {
        const columnSpacing = 60;
        const staggerShift = 30; // Half-width aside

        // Logical "Aside" toggle: Every row change flips the X-offset by 30px
        const rowOffset = (Math.abs(this.r) % 2) * staggerShift;

        this.x = this.c * columnSpacing + rowOffset;
        this.y = this.r * this.h;
    }
}

export class Wall {
    constructor(canvas) {
        this.canvas = canvas;
        this.brickWidth = 60;
        this.brickHeight = 25;
        this.columnSpacing = 60;
        this.bricks = new Map(); // Key: 'c,r' -> Brick
        this.depths = []; // Integer row depths per column

        this.init();
    }

    init() {
        const gameWidth = this.canvas.clientWidth;
        this.midR = Math.round((this.canvas.clientHeight / 2) / this.brickHeight);

        // Grid coverage
        this.numCols = Math.ceil(gameWidth / this.columnSpacing) + 6;
        this.startCol = -3;

        this.depths = new Array(this.numCols).fill(this.midR);
        this.rebuildBricks();
    }

    addBrick(r, c) {
        const key = `${c},${r}`;
        if (this.bricks.has(key)) return;
        this.bricks.set(key, new Brick(r, c, this.brickWidth, this.brickHeight));
    }

    rebuildBricks() {
        this.bricks.clear();
        // SURGICAL STAIRCASE:
        // Every column builds a minimal vertical pillar to seal with the NEXT neighbor.
        // This ensures a 100% solid wall for any height step while staying lean.
        for (let i = 0; i < this.numCols; i++) {
            const rMe = this.depths[i];
            const cMe = this.startCol + i;

            // Build bricks from my depth to the neighbor's depth
            let minR = rMe;
            let maxR = rMe;

            if (i < this.numCols - 1) {
                const rNext = this.depths[i + 1];
                minR = Math.min(rMe, rNext);
                maxR = Math.max(rMe, rNext);
            }

            // Fill the range - ensures no horizontal or vertical holes
            for (let r = minR; r <= maxR; r++) {
                this.addBrick(r, cMe);
            }
        }
    }

    update(game) {
        // SURGICAL PERMANENCE: No auto-healing.
        // Bricks only move when hit.
        for (const b of this.bricks.values()) b.updatePos();
    }

    checkCollision(ball) {
        // GHOST SHIELD: Physics (120px) ensures zero tunneling on corners.
        const physicsRW = 60 + ball.radius;
        const physicsRH = (this.brickHeight / 2) + ball.radius + 2;

        let bestBrick = null;
        let minDx = Infinity;

        for (const brick of this.bricks.values()) {
            const dx = ball.x - brick.x;
            const dy = ball.y - brick.y;

            if (Math.abs(dx) < physicsRW && Math.abs(dy) < physicsRH) {
                const isHeadingTowardsWall = (ball.side === 'top' && ball.vy > 0) ||
                    (ball.side === 'bottom' && ball.vy < 0);

                if (isHeadingTowardsWall || Math.abs(dy) < 10) {
                    if (Math.abs(dx) < minDx) {
                        minDx = Math.abs(dx);
                        bestBrick = brick;
                    }
                }
            }
        }

        if (bestBrick) {
            // SURGICAL MOVE: Exactly 1 row height (25px)
            const localIdx = bestBrick.c - this.startCol;
            const push = (ball.side === 'top' ? 1 : -1);
            this.depths[localIdx] += push;

            this.rebuildBricks(); // Snaps to new position, old bricks are GONE.

            // Resolve axes relative to the hit spot
            const b = bestBrick;
            const dx = ball.x - b.x;
            const dy = ball.y - b.y;
            const visRW = (this.brickWidth / 2) + ball.radius;
            const visRH = (this.brickHeight / 2) + ball.radius;

            const overlapX = visRW - Math.abs(dx);
            const overlapY = visRH - Math.abs(dy);

            if (overlapX < (overlapY - 5) && Math.abs(dx) > (this.brickWidth / 2 - 10)) {
                ball.vx *= -1;
                ball.x = dx > 0 ? b.x + visRW + 2 : b.x - visRW - 2;
                // Field-Safe Ejection
                if (ball.side === 'top') ball.y = Math.min(ball.y, b.y - visRH);
                else ball.y = Math.max(ball.y, b.y + visRH);
            } else {
                ball.vy *= -1;
                // ROBUST EJECTION: 12px boost ensures it clears the new 'aside' jump
                const ejectDist = visRH + 12;
                ball.y = dy > 0 ? b.y + ejectDist : b.y - ejectDist;
            }

            return true;
        }

        // TERRITORY SAFETY NET - Absolute stop-gap
        const colIdx = Math.round(ball.x / 60) - this.startCol;
        if (colIdx >= 0 && colIdx < this.numCols) {
            const wallBoundary = this.depths[colIdx] * this.brickHeight;
            const buffer = ball.radius + 5;
            if (ball.side === 'top' && ball.y > wallBoundary - buffer) {
                ball.y = wallBoundary - (buffer + 15);
                ball.vy = -Math.abs(ball.vy);
            }
            if (ball.side === 'bottom' && ball.y < wallBoundary + buffer) {
                ball.y = wallBoundary + (buffer + 15);
                ball.vy = Math.abs(ball.vy);
            }
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

        for (const b of this.bricks.values()) {
            const rx = b.x - b.w / 2;
            const ry = b.y - b.h / 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(rx, ry, b.w, b.h, 4);
            else ctx.rect(rx, ry, b.w, b.h);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
