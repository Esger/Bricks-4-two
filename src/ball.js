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

        const gameWidth = this.canvas.clientWidth;
        const gameHeight = this.canvas.clientHeight;

        this.x = gameWidth / 2;
        if (this.side === 'top') {
            this.y = 60; // Just below top score area
        } else {
            this.y = gameHeight - 60; // Just above bottom score area
        }
    }

    launch(paddleX, targetX, targetY) {
        if (this.active) return;

        this.active = true;
        const dx = targetX - paddleX;
        const dy = targetY - (this.side === 'top' ? 20 : this.canvas.clientHeight - 20);
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const minSpeed = 2;

        const computedMax = Math.min(12, Math.max(6, Math.round(this.canvas.clientHeight / 80)));
        this.maxGameSpeed = computedMax;

        const maxSpeed = this.maxGameSpeed || 10;
        this.gameSpeed = Math.min(maxSpeed, Math.max(minSpeed, dist / 40));

        let nx = dx / dist;
        let ny = dy / dist;

        if (Math.abs(ny) < Math.abs(nx)) {
            ny = Math.sign(ny) * Math.abs(nx);
            const nlen = Math.hypot(nx, ny) || 1;
            nx /= nlen; ny /= nlen;
        }

        this.vx = nx * this.gameSpeed;
        this.vy = ny * this.gameSpeed;
    }

    update(game) {
        if (!this.active) return;

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
                this._onBounce();
            } else if (this.x + this.radius > game.width) {
                this.x = game.width - this.radius;
                this.vx *= -1;
                this._onBounce();
            }

            // Bounce off the middle wall (bricks)
            // checkCollision will update this.vx/this.vy if a hit occurs
            const wallHit = game.wall.checkCollision(this);
            if (wallHit) {
                this._onBounce();
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
        if (this.y + this.radius < -100) scoringWinner = 'bottom';
        else if (this.y - this.radius > gameHeight + 100) scoringWinner = 'top';

        if (scoringWinner) {
            game.scorePoint(scoringWinner);
            const ballArray = (this.side === 'top') ? game.ballsTop : game.ballsBottom;
            const others = ballArray.filter(b => b !== this);

            if (others.length > 0) {
                this.active = false;
                if (this.side === 'top') game.ballsTop = others;
                else game.ballsBottom = others;
            } else {
                this.reset();
                this.isExtra = false;
            }
        }
    }

    _checkPaddleBounce(paddle) {
        const pBounds = paddle.getBounds();
        if (this.x > pBounds.left && this.x < pBounds.right) {
            if (this.y + this.radius > pBounds.top && this.y - this.radius < pBounds.bottom) {
                // Determine eject direction
                if (this.vy < 0 && this.y > pBounds.centerY) {
                    this.y = pBounds.bottom + this.radius;
                    this.vy *= -1;
                } else if (this.vy > 0 && this.y < pBounds.centerY) {
                    this.y = pBounds.top - this.radius;
                    this.vy *= -1;
                } else {
                    return;
                }

                const hitPos = (this.x - paddle.x) / (paddle.width / 2);
                this.vx += hitPos * 2;
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
                this.vx = (this.vx / currentSpeed) * this.gameSpeed;
                this.vy = (this.vy / currentSpeed) * this.gameSpeed;
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
