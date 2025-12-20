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

        // Direction from paddle center to tap point
        const dx = targetX - paddleX;
        const dy = targetY - (this.side === 'top' ? 20 : this.canvas.clientHeight - 20);

        const dist = Math.sqrt(dx * dx + dy * dy);

        // This sets the speed for the life of this ball
        this.gameSpeed = Math.min(10, dist / 40);

        this.vx = (dx / dist) * this.gameSpeed;
        this.vy = (dy / dist) * this.gameSpeed;
    }

    update(game) {
        if (!this.active) return;

        this.x += this.vx;
        this.y += this.vy;

        const gameWidth = game.width;
        const gameHeight = game.height;

        // Bounce off left/right walls
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -1;
        } else if (this.x + this.radius > gameWidth) {
            this.x = gameWidth - this.radius;
            this.vx *= -1;
        }

        // Bounce off the middle wall
        game.wall.checkCollision(this);

        // Bounce off paddles or go off-screen
        const paddle = (this.side === 'top') ? game.paddleTop : game.paddleBottom;
        const pBounds = paddle.getBounds();

        if (this.side === 'top') {
            if (this.y - this.radius < pBounds.bottom && this.y + this.radius > pBounds.top) {
                if (this.x > pBounds.left && this.x < pBounds.right) {
                    this.y = pBounds.bottom + this.radius;
                    this.vy *= -1;

                    // Change direction based on where it hit the paddle
                    const hitPos = (this.x - paddle.x) / (paddle.width / 2);
                    this.vx += hitPos * 2;

                    // RE-NORMALIZE TO THE LAUNCH SPEED
                    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    this.vx = (this.vx / currentSpeed) * this.gameSpeed;
                    this.vy = (this.vy / currentSpeed) * this.gameSpeed;
                }
            }

            // Off-screen (Top)
            if (this.y + this.radius < 0) {
                game.scorePoint('bottom');
                this.reset();
            }
        } else {
            if (this.y + this.radius > pBounds.top && this.y - this.radius < pBounds.bottom) {
                if (this.x > pBounds.left && this.x < pBounds.right) {
                    this.y = pBounds.top - this.radius;
                    this.vy *= -1;

                    // Change direction based on where it hit the paddle
                    const hitPos = (this.x - paddle.x) / (paddle.width / 2);
                    this.vx += hitPos * 2;

                    // RE-NORMALIZE TO THE LAUNCH SPEED
                    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    this.vx = (this.vx / currentSpeed) * this.gameSpeed;
                    this.vy = (this.vy / currentSpeed) * this.gameSpeed;
                }
            }

            // Off-screen (Bottom)
            if (this.y - this.radius > gameHeight) {
                game.scorePoint('top');
                this.reset();
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x - 2, this.y - 2, this.radius / 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
