export class Ball {
    constructor(canvas, side, color) {
        this.canvas = canvas;
        this.side = side; // 'top' or 'bottom'
        this.color = color;

        this.radius = 8;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.active = false;
        this.isExtra = false; // flag for spawned extra balls

        // Speed growth configuration
        this.maxGameSpeed = 10;
        this.bounceGrowthFactor = 0.035;

        this.reset();
    }

    reset() {
        this.active = false;
        this.vx = 0;
        this.vy = 0;
        this.gameSpeed = 0;
    }

    launch(paddle, targetX, targetY) {
        if (this.active) return;

        this.active = true;
        const dx = targetX - paddle.x;
        const dy = targetY - paddle.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const minSpeed = 2;

        const computedMax = Math.min(12, Math.max(6, Math.round(this.canvas.clientHeight / 80)));
        this.maxGameSpeed = computedMax;

        const maxSpeed = this.maxGameSpeed || 10;
        this.gameSpeed = Math.min(maxSpeed, Math.max(minSpeed, dist / 40));

        let nx = dx / dist;
        let ny = dy / dist;

        // Ensure we always launch with some vertical component towards the wall
        const verticalMin = 0.4;
        if (this.side === 'top') {
            if (ny < verticalMin) ny = verticalMin;
        } else {
            if (ny > -verticalMin) ny = -verticalMin;
        }

        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen; ny /= nlen;

        this.vx = nx * this.gameSpeed;
        this.vy = ny * this.gameSpeed;
    }

    update(game) {
        if (!this.active) {
            const paddle = (this.side === 'top') ? game.paddleTop : game.paddleBottom;
            this.x = paddle.x;
            const offset = (this.radius + paddle.height / 2 + 2);
            this.y = (this.side === 'top') ? paddle.y + offset : paddle.y - offset;
            return;
        }

        // DYNAMIC SUB-STEPPING: Ensure no tunneling at high speeds
        // We move in small increments and re-check velocity each time
        const subSteps = Math.max(1, Math.ceil(this.gameSpeed / 2));
        const dt = 1.0 / subSteps;

        for (let s = 0; s < subSteps; s++) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;

            // Bounce off left/right walls
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vx *= -1;
            } else if (this.x + this.radius > game.width) {
                this.x = game.width - this.radius;
                this.vx *= -1;
            }

            // Bounce off the middle wall (bricks)
            const wallHit = game.wall.checkCollision(this);
            if (wallHit) {
                if (game.onWallHit) game.onWallHit(this);
            }
        }

        const gameHeight = game.height;
        const paddle = (this.side === 'top') ? game.paddleTop : game.paddleBottom;
        const opponentPaddle = (this.side === 'top') ? game.paddleBottom : game.paddleTop;

        // Check bounce for OWN paddle and OPPONENT paddle
        this._checkPaddleBounce(paddle);
        this._checkPaddleBounce(opponentPaddle);

        // Unified Off-screen cleanup
        let scoringWinner = null;
        if (this.y < -this.radius) scoringWinner = 'bottom';
        else if (this.y > gameHeight + this.radius) scoringWinner = 'top';

        if (scoringWinner) {
            game.scorePoint(scoringWinner);
            const ballArray = (this.side === 'top') ? game.ballsTop : game.ballsBottom;
            const isLast = ballArray.length <= 1;

            if (!isLast) {
                // Remove extra ball
                this.active = false;
                if (this.side === 'top') game.ballsTop = ballArray.filter(b => b !== this);
                else game.ballsBottom = ballArray.filter(b => b !== this);
            } else {
                // Last ball on its side - reset to home base
                this.reset();
                this.isExtra = false;
                this.isExtra = false; // Ensure it's no longer marked as extra
                // The ball remains in the array as it's the primary ball for this side
            }
        }
    }

    _checkPaddleBounce(paddle) {
        const pBounds = paddle.getBounds();
        // Check if ball is within x-bounds of the paddle
        if (this.x + this.radius > pBounds.left && this.x - this.radius < pBounds.right) {
            // Check if ball is overlapping the paddle's vertical space
            if (this.y + this.radius > pBounds.top && this.y - this.radius < pBounds.bottom) {
                // Determine eject direction based on velocity
                if (this.vy < 0 && this.y > pBounds.centerY) {
                    // Hit top paddle from below
                    this.y = pBounds.bottom + this.radius;
                    this.vy *= -1;
                } else if (this.vy > 0 && this.y < pBounds.centerY) {
                    // Hit bottom paddle from above
                    this.y = pBounds.top - this.radius;
                    this.vy *= -1;
                } else {
                    return;
                }

                // Apply "curved" paddle deflection
                // hitPos ranges from -1 (left edge) to 1 (right edge)
                const hitPos = (this.x - paddle.x) / (paddle.width / 2);

                // Add stronger deflection
                this.vx += hitPos * 3;

                // Enforce a minimum vertical velocity (at least 20% of total speed)
                // This prevents the ball from going too horizontal
                const minVy = this.gameSpeed * 0.2;
                if (Math.abs(this.vy) < minVy) {
                    this.vy = (this.vy > 0 ? 1 : -1) * minVy;
                }

                this._onBounce();
            }
        }
    }

    _onBounce() {
        if (!this.gameSpeed) return;
        const maxSpeed = this.maxGameSpeed || 10;
        const growth = this.bounceGrowthFactor || 0.05;
        this.gameSpeed = Math.min(maxSpeed, this.gameSpeed + (maxSpeed - this.gameSpeed) * growth);
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
        this.vx = (this.vx / currentSpeed) * this.gameSpeed;
        this.vy = (this.vy / currentSpeed) * this.gameSpeed;
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x - 2, this.y - 2, this.radius / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
