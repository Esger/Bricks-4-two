import { Paddle } from './paddle.js';
import { Ball } from './ball.js';
import { Wall } from './wall.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false }); // Performance optimization
        this.width = 0;
        this.height = 0;
        this.running = false;

        this.scoreTop = 0;
        this.scoreBottom = 0;

        this.paddleTop = new Paddle(canvas, 'top', '#ff3e3e');
        this.paddleBottom = new Paddle(canvas, 'bottom', '#3e8dff');

        // Support multiple balls per side
        this.ballsTop = [new Ball(canvas, 'top', '#ff6b6b')];
        this.ballsBottom = [new Ball(canvas, 'bottom', '#6ba5ff')];

        this.wall = new Wall(canvas);

        // Helper: small chance special bricks will appear occasionally
        this._lastSpawnedExtraAt = 0;

        this.resize();
        this.initUI();
        this.initInput();
    }

    initInput() {
        const handlePointer = (e) => {
            if (!this.running) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Upper half controls the top player; lower half controls the bottom player
            if (y >= this.height / 2) {
                this.paddleBottom.moveTo(x);
            } else {
                this.paddleTop.moveTo(x);
            }
        };

        this.canvas.addEventListener('pointermove', handlePointer);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Prevent default touch gestures that may trigger browser navigation (edge swipes, back/forward)
        // Use non-passive listeners so we can call preventDefault()
        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });

        this.canvas.addEventListener('pointerdown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Upper half launches a top-side ball; lower half launches a bottom-side ball
            if (y >= this.height / 2) {
                // Launch primary bottom ball (first in array)
                if (this.ballsBottom[0]) this.ballsBottom[0].launch(this.paddleBottom.x, x, y);
            } else {
                if (this.ballsTop[0]) this.ballsTop[0].launch(this.paddleTop.x, x, y);
            }
        });
    }

    resize() {
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = this.width * window.devicePixelRatio;
        this.canvas.height = this.height * window.devicePixelRatio;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        if (this.paddleTop) this.paddleTop.reset();
        if (this.paddleBottom) this.paddleBottom.reset();

        // Recompute wall layout on canvas resize so bricks always fit exactly
        if (this.wall) this.wall.initializeWall();
    }

    initUI() {
        this.updateScoreDisplay();
    }

    updateScoreDisplay() {
        const tally = (score) => '|'.repeat(score);
        document.getElementById('score-top').textContent = tally(this.scoreTop);
        document.getElementById('score-bottom').textContent = tally(this.scoreBottom);
    }

    start() {
        this.running = true;
        this.scoreTop = 0;
        this.scoreBottom = 0;
        this.updateScoreDisplay();

        this.paddleTop.reset();
        this.paddleBottom.reset();

        // Reset to one primary ball per side
        this.ballsTop = [new Ball(this.canvas, 'top', '#ff6b6b')];
        this.ballsBottom = [new Ball(this.canvas, 'bottom', '#6ba5ff')];
        this.ballsTop.forEach(b => b.reset());
        this.ballsBottom.forEach(b => b.reset());

        this.wall.initializeWall();
    }

    spawnExtraBall(side) {
        const paddle = (side === 'top') ? this.paddleTop : this.paddleBottom;
        const color = (side === 'top') ? '#ff6b6b' : '#6ba5ff';
        const b = new Ball(this.canvas, side, color);
        b.isExtra = true;

        // Spawn just above/below paddle
        b.x = paddle.x;
        b.y = paddle.y + ((side === 'top') ? (paddle.height + b.radius + 4) : -(paddle.height + b.radius + 4));

        // Give it an upward (from bottom) or downward (from top) initial velocity
        const minLaunch = 2; // keep consistent with min launch speed used in Ball.launch
        const primary = (side === 'top') ? this.ballsTop[0] : this.ballsBottom[0];
        const baseSpeed = (primary && primary.gameSpeed) || minLaunch;
        const initialSpeed = Math.max(minLaunch, Math.min(8, baseSpeed));
        const vx = (Math.random() - 0.5) * 2; // small horizontal
        const vy = (side === 'bottom') ? -Math.abs(initialSpeed) : Math.abs(initialSpeed);
        const len = Math.hypot(vx, vy) || 1;
        b.vx = (vx / len) * initialSpeed;
        b.vy = (vy / len) * initialSpeed;
        b.gameSpeed = initialSpeed;
        b.active = true;

        if (side === 'top') this.ballsTop.push(b);
        else this.ballsBottom.push(b);
    }

    scorePoint(winner) {
        if (winner === 'top') {
            this.scoreTop++;
        } else {
            this.scoreBottom++;
        }
        this.updateScoreDisplay();

        // When someone scores, remove extra balls on the side that lost so each point is fair
        if (winner === 'top') {
            // top scored -> bottom lost
            this.ballsBottom = this.ballsBottom.filter(b => !b.isExtra);
        } else {
            this.ballsTop = this.ballsTop.filter(b => !b.isExtra);
        }
    }

    onWallHit(ball) {
        // React to special bricks: if the recently hit brick was a special 'extraBall', spawn a new ball on the hitter's side
        const lastType = this.wall.lastHitBrickType;
        if (lastType === 'extraBall') {
            console.log('Special brick hit! Spawning extra ball for', ball.side);
            this.spawnExtraBall(ball.side);
        }
    }

    update(now) {
        if (!this.running) return;

        // --- TRAINING PAUSE ---
        // Escape key toggles this state in wall.js
        if (this.wall.isDebugPaused) return;

        // Update all balls
        for (const b of this.ballsTop) b.update(this);
        for (const b of this.ballsBottom) b.update(this);

        // Remove inactive extra balls to avoid accumulation
        this.ballsTop = this.ballsTop.filter(b => !(b.isExtra && !b.active));
        this.ballsBottom = this.ballsBottom.filter(b => !(b.isExtra && !b.active));

        this.wall.update(this);
    }

    draw() {
        // Dark background
        this.ctx.fillStyle = '#0d0d12';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.running) return;

        // Mid-line (Base)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw wall
        this.wall.draw(this.ctx);

        // Draw paddles
        this.paddleTop.draw(this.ctx);
        this.paddleBottom.draw(this.ctx);

        // Draw balls
        for (const b of this.ballsTop) b.draw(this.ctx);
        for (const b of this.ballsBottom) b.draw(this.ctx);
    }
}
