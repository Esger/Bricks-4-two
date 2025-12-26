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

        // AI state
        this.isAiTop = false;
        this.isAiBottom = false;
        this.lastResetTime = 0;
        this.aiThreshold = 10000; // 10 seconds in ms

        // Initial launch on first tap on overlay
        this.onFirstTap = () => {
            if (!this.running) {
                this.start();
                this.overlay.removeEventListener('pointerdown', this.onFirstTap);
            }
        };

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
                this.isAiBottom = false; // Manually moving disables AI
            } else {
                this.paddleTop.moveTo(x);
                this.isAiTop = false; // Manually moving disables AI
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
                if (this.ballsBottom[0]) {
                    this.ballsBottom[0].launch(this.paddleBottom.x, x, y);
                    this.isAiBottom = false;
                }
            } else {
                if (this.ballsTop[0]) {
                    this.ballsTop[0].launch(this.paddleTop.x, x, y);
                    this.isAiTop = false;
                }
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
        this.overlay = document.getElementById('overlay');
        this.message = document.getElementById('message');
        this.restartBtn = document.getElementById('restart-btn');

        // Initially hide restart button for the "Tap to Start" splash
        this.restartBtn.style.display = 'none';

        this.restartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.start();
        });

        // Use multiple events for maximum compatibility
        this.overlay.addEventListener('click', this.onFirstTap);
        this.overlay.addEventListener('pointerdown', this.onFirstTap);
        this.overlay.style.cursor = 'pointer';
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

        this.overlay.classList.add('hidden');
        this.restartBtn.style.display = 'none';

        this.paddleTop.reset();
        this.paddleBottom.reset();

        // Reset to one primary ball per side
        this.ballsTop = [new Ball(this.canvas, 'top', '#ff6b6b')];
        this.ballsBottom = [new Ball(this.canvas, 'bottom', '#6ba5ff')];
        this.ballsTop.forEach(b => b.reset());
        this.ballsBottom.forEach(b => b.reset());

        this.wall.initializeWall();
        this.lastResetTime = performance.now();
        this.isAiTop = false;
        this.isAiBottom = false;
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

        // Update AI
        const currentTime = performance.now();
        const timeSinceReset = currentTime - this.lastResetTime;
        if (timeSinceReset > this.aiThreshold) {
            // Only take over if primary ball is NOT active (hasn't been launched)
            if (this.ballsTop[0] && !this.ballsTop[0].active) this.isAiTop = true;
            if (this.ballsBottom[0] && !this.ballsBottom[0].active) this.isAiBottom = true;
        }

        if (this.isAiTop) this.updateAI('top');
        if (this.isAiBottom) this.updateAI('bottom');

        this.wall.update(this);

        // Check for win condition (wall reach far end)
        const wallWinner = this.wall.checkWin();
        if (wallWinner) {
            this.gameOver(wallWinner, 'The wall reached the end!');
        }
    }

    gameOver(winner, reason) {
        this.running = false;
        const winnerName = winner === 'top' ? 'RED' : 'BLUE';
        const winnerColor = winner === 'top' ? '#ff3e3e' : '#3e8dff';

        this.message.textContent = `${winnerName} WINS!`;
        this.message.style.color = winnerColor;
        this.message.style.borderColor = winnerColor;
        this.message.style.boxShadow = `0 0 20px ${winnerColor}44`;

        this.overlay.classList.remove('hidden');
        this.restartBtn.style.display = 'block';

        // Update score one last time if it was a ball loss
        this.updateScoreDisplay();

        this.isAiTop = false;
        this.isAiBottom = false;
    }

    updateAI(side) {
        const paddle = (side === 'top') ? this.paddleTop : this.paddleBottom;
        const balls = (side === 'top') ? this.ballsTop : this.ballsBottom;
        const opponentBalls = (side === 'top') ? this.ballsBottom : this.ballsTop;

        const primaryBall = balls[0];

        // 1. Launch ball if inactive
        if (primaryBall && !primaryBall.active) {
            // Aim for a target area (center-ish)
            const targetX = this.width / 2 + (Math.random() - 0.5) * 100;
            const targetY = this.height / 2;
            primaryBall.launch(paddle.x, targetX, targetY);
            return;
        }

        // 2. Intercept incoming balls
        // Sort balls by proximity to the paddle side in the direction of travel
        const allBalls = [...balls, ...opponentBalls].filter(b => b.active);
        const incomingBalls = allBalls.filter(b => {
            if (side === 'top') return b.vy < 0; // Moving towards top
            return b.vy > 0; // Moving towards bottom
        });

        if (incomingBalls.length > 0) {
            // Pick ball that will hit first
            incomingBalls.sort((a, b) => {
                const distA = (side === 'top') ? a.y : this.height - a.y;
                const distB = (side === 'top') ? b.y : this.height - b.y;
                return distA - distB;
            });

            const targetBall = incomingBalls[0];

            // Predict x position (simplified intercept)
            let targetX = targetBall.x;

            // Add some "aiming" logic: try to hit near the edge of paddle to deflect towards the wall-winner side
            // For now, just aim to be centered on the ball
            paddle.moveTo(targetX);
        } else {
            // Idle behavior: move towards screen center or primary ball
            const idleX = primaryBall ? primaryBall.x : this.width / 2;
            const targetX = paddle.x + (idleX - paddle.x) * 0.1;
            paddle.moveTo(targetX);
        }
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
