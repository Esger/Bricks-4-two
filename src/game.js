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

        this.matchesWonTop = 0;
        this.matchesWonBottom = 0;

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
        this.aiThreshold = 10000; // 10 seconds in ms
        this.lastActionTop = 0;
        this.lastActionBottom = 0;
        this.winData = null;

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

    get isDemoMode() {
        return this.isAiTop && this.isAiBottom;
    }

    initInput() {
        const handlePointer = (e) => {
            if (!this.running) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left);
            const y = (e.clientY - rect.top);

            // Upper half controls the top player; lower half controls the bottom player
            if (y >= this.height / 2) {
                this.paddleBottom.moveTo(x);
                this.isAiBottom = false; // Manually moving disables AI
                this.lastActionBottom = performance.now();
            } else {
                this.paddleTop.moveTo(x);
                this.isAiTop = false; // Manually moving disables AI
                this.lastActionTop = performance.now();
            }
        };

        this.canvas.addEventListener('pointermove', handlePointer);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Prevent default touch gestures that may trigger browser navigation (edge swipes, back/forward)
        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });

        this.canvas.addEventListener('pointerdown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // CHECK FOR DEMO BRICK CLICK
            const demoBrick = this.wall.getDemoBrick();
            if (demoBrick) {
                const bx = demoBrick.canvasXPosition;
                const by = demoBrick.canvasYPosition;
                const bw = demoBrick.width / 2;
                const bh = demoBrick.height / 2;
                if (Math.abs(x - bx) < bw && Math.abs(y - by) < bh) {
                    this.isAiTop = true;
                    this.isAiBottom = true;
                    return;
                }
            }

            // DETERMINE WHICH BALL TO LAUNCH
            // Logic:
            // 1. If only one side has an inactive ball AND is human-controlled, launch it (flexible aiming).
            // 2. If both have inactive balls, use the 50/50 height split.

            const bottomNeedsLaunch = this.ballsBottom[0] && !this.ballsBottom[0].active && !this.isAiBottom;
            const topNeedsLaunch = this.ballsTop[0] && !this.ballsTop[0].active && !this.isAiTop;

            if (bottomNeedsLaunch && !topNeedsLaunch) {
                this.ballsBottom[0].launch(this.paddleBottom, x, y);
                this.isAiBottom = false;
                this.lastActionBottom = performance.now();
            } else if (topNeedsLaunch && !bottomNeedsLaunch) {
                this.ballsTop[0].launch(this.paddleTop, x, y);
                this.isAiTop = false;
                this.lastActionTop = performance.now();
            } else {
                // Both need launch or both are AI - use zonal split
                if (y >= this.height / 2) {
                    if (this.ballsBottom[0]) {
                        this.ballsBottom[0].launch(this.paddleBottom, x, y);
                        this.isAiBottom = false;
                        this.lastActionBottom = performance.now();
                    }
                } else {
                    if (this.ballsTop[0]) {
                        this.ballsTop[0].launch(this.paddleTop, x, y);
                        this.isAiTop = false;
                        this.lastActionTop = performance.now();
                    }
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
        const formatTally = (score) => {
            if (score <= 0) return '';
            const fives = Math.floor(score / 5);
            const ones = score % 5;
            let html = '';

            // Full blocks of five
            for (let i = 0; i < fives; i++) {
                html += `
                    <div class="tally-block">
                        <div class="mark"></div>
                        <div class="mark"></div>
                        <div class="mark"></div>
                        <div class="mark"></div>
                        <div class="slash"></div>
                    </div>`;
            }

            // Partial block for remaining ones
            if (ones > 0) {
                html += '<div class="tally-block">';
                for (let i = 0; i < ones; i++) {
                    html += '<div class="mark"></div>';
                }
                html += '</div>';
            }
            return html;
        };
        document.getElementById('score-top').innerHTML = formatTally(this.matchesWonTop);
        document.getElementById('score-bottom').innerHTML = formatTally(this.matchesWonBottom);
    }

    start() {
        this.running = true;
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
        this.lastActionTop = performance.now();
        this.lastActionBottom = performance.now();
        this.isAiTop = false;
        this.isAiBottom = false;
        this.winData = null;
        this.overlay.classList.remove('rotate-180');
    }

    spawnExtraBall(side) {
        const paddle = (side === 'top') ? this.paddleTop : this.paddleBottom;
        const color = (side === 'top') ? '#ff6b6b' : '#6ba5ff';
        const b = new Ball(this.canvas, side, color);
        b.isExtra = true;
        b.x = paddle.x;
        b.y = paddle.y + ((side === 'top') ? (paddle.height + b.radius + 4) : -(paddle.height + b.radius + 4));

        const minLaunch = 2;
        const primary = (side === 'top') ? this.ballsTop[0] : this.ballsBottom[0];
        const baseSpeed = (primary && primary.gameSpeed) || minLaunch;
        const initialSpeed = Math.max(minLaunch, Math.min(8, baseSpeed));
        const vx = (Math.random() - 0.5) * 2;
        const vy = (side === 'bottom') ? -Math.abs(initialSpeed) : Math.abs(initialSpeed);
        const len = Math.hypot(vx, vy) || 1;
        b.vx = (vx / len) * initialSpeed;
        b.vy = (vy / len) * initialSpeed;
        b.gameSpeed = initialSpeed;
        b.active = true;

        if (side === 'top') this.ballsTop.push(b);
        else this.ballsBottom.push(b);
    }

    removeOneBall(side) {
        const ballArray = (side === 'top') ? this.ballsTop : this.ballsBottom;
        if (ballArray.length > 1) {
            // Deactivate the first extra ball we find
            const extraBall = ballArray.find(b => b.isExtra && b.active);
            if (extraBall) {
                extraBall.active = false;
            } else {
                // If somehow no extra ball but multiple balls, reset the first one
                ballArray[0].reset();
            }
        } else {
            // Only one ball left - reset it to the paddle
            if (ballArray[0]) ballArray[0].reset();
        }
    }

    scorePoint(winner) {
        // Point scoring on ball-loss is now disabled in favor of Match Wins tally.
        // We still trigger the timer update to allow for AI handoff.
        if (winner === 'top') {
            this.lastActionBottom = performance.now();
        } else {
            this.lastActionTop = performance.now();
        }
    }

    onWallHit(ball) {
        const isAiPlayer = (ball.side === 'top' ? this.isAiTop : this.isAiBottom);
        const lastType = this.wall.lastHitBrickType;

        // Special: If DEMO brick hit, enable AI for everyone
        if (lastType === 'demo') {
            this.isAiTop = true;
            this.isAiBottom = true;
        }

        if (isAiPlayer && !this.isDemoMode) return;

        if (lastType === 'extraBall') {
            this.spawnExtraBall(ball.side);
        } else if (lastType === 'removeBall') {
            this.removeOneBall(ball.side);
        } else if (lastType === 'enlargePaddle') {
            const paddle = (ball.side === 'top') ? this.paddleTop : this.paddleBottom;
            paddle.changeWidth(40, performance.now());
        } else if (lastType === 'shrinkPaddle') {
            const paddle = (ball.side === 'top') ? this.paddleTop : this.paddleBottom;
            paddle.changeWidth(-40, performance.now());
        }
    }

    update(now) {
        if (!this.running) return;

        // ANTI-STALL: Ensure at least one primary ball exists per side
        if (this.ballsTop.length === 0) this.ballsTop = [new Ball(this.canvas, 'top', '#ff6b6b')];
        if (this.ballsBottom.length === 0) this.ballsBottom = [new Ball(this.canvas, 'bottom', '#6ba5ff')];

        // Update all balls
        for (const b of this.ballsTop) b.update(this);
        for (const b of this.ballsBottom) b.update(this);

        this.ballsTop = this.ballsTop.filter(b => !(b.isExtra && !b.active));
        this.ballsBottom = this.ballsBottom.filter(b => !(b.isExtra && !b.active));

        // Resolve brick removals after all balls have updated their positions/bounces
        this.wall.resolvePendingImpacts();

        // Update AI timers
        const currentTime = performance.now();
        if (!this.isAiTop && (currentTime - this.lastActionTop > this.aiThreshold)) {
            if (this.ballsTop[0] && !this.ballsTop[0].active) this.isAiTop = true;
        }
        if (!this.isAiBottom && (currentTime - this.lastActionBottom > this.aiThreshold)) {
            if (this.ballsBottom[0] && !this.ballsBottom[0].active) this.isAiBottom = true;
        }

        if (this.isAiTop) this.updateAI('top');
        if (this.isAiBottom) this.updateAI('bottom');

        this.paddleTop.update(now);
        this.paddleBottom.update(now);

        this.wall.update(this);

        const winResult = this.wall.checkWin();
        if (winResult) this.gameOver(winResult, 'The wall reached the end!');
    }

    gameOver(winData, reason) {
        this.running = false;
        this.winData = winData;
        const winner = winData.winner;

        // Match Win increment
        if (winner === 'top') this.matchesWonTop++;
        else this.matchesWonBottom++;

        const winnerName = winner === 'top' ? 'RED' : 'BLUE';
        const winnerColor = winner === 'top' ? '#ff3e3e' : '#3e8dff';

        this.message.textContent = `${winnerName} WINS!`;
        this.message.style.color = winnerColor;
        this.message.style.borderColor = winnerColor;
        this.message.style.boxShadow = `0 0 20px ${winnerColor}44`;

        this.overlay.classList.remove('hidden');
        if (winner === 'top') {
            this.overlay.classList.add('rotate-180');
        } else {
            this.overlay.classList.remove('rotate-180');
        }
        this.restartBtn.style.display = 'block';
        this.updateScoreDisplay();

        this.isAiTop = false;
        this.isAiBottom = false;
    }

    updateAI(side) {
        const paddle = (side === 'top') ? this.paddleTop : this.paddleBottom;
        const balls = (side === 'top') ? this.ballsTop : this.ballsBottom;
        const opponentBalls = (side === 'top') ? this.ballsBottom : this.ballsTop;

        const primaryBall = balls[0];

        if (primaryBall && !primaryBall.active) {
            const targetX = this.width / 2 + (Math.random() - 0.5) * 100;
            const targetY = this.isDemoMode ? this.height / 2 : ((side === 'top') ? paddle.y + 10 : paddle.y - 10);
            primaryBall.launch(paddle, targetX, targetY);
            return;
        }

        const allBalls = [...balls, ...opponentBalls].filter(b => b.active);
        const incomingBalls = allBalls.filter(b => {
            if (side === 'top') return b.vy < 0;
            return b.vy > 0;
        });

        if (incomingBalls.length > 0) {
            incomingBalls.sort((a, b) => {
                const distA = (side === 'top') ? a.y : this.height - a.y;
                const distB = (side === 'top') ? b.y : this.height - b.y;
                return distA - distB;
            });

            const targetBall = incomingBalls[0];
            const trackingSpeed = this.isDemoMode ? 1.0 : 0.15;

            let steerOffset = 0;
            const horizontalRatio = Math.abs(targetBall.vx) / (Math.abs(targetBall.vy) || 0.1);
            let finalTrackingSpeed = trackingSpeed;

            // If ball is getting horizontal, hit it with the corners to steepen the angle
            if (horizontalRatio > 2) {
                // steerOffset = how much we push the paddle *away* from the ball's center
                // to make the ball hit the counter-acting corner.
                const intensity = Math.min(0.45, horizontalRatio * 0.1);
                steerOffset = (targetBall.vx > 0) ? (paddle.width * intensity) : -(paddle.width * intensity);

                // If it's very flat, prioritize this move with faster reaction
                if (horizontalRatio > 4) finalTrackingSpeed = Math.max(0.4, trackingSpeed);
            }

            let targetX = paddle.x + ((targetBall.x + steerOffset) - paddle.x) * finalTrackingSpeed;
            paddle.moveTo(targetX);
        } else {
            const idleX = primaryBall ? primaryBall.x : this.width / 2;
            const targetX = paddle.x + (idleX - paddle.x) * 0.05;
            paddle.moveTo(targetX);
        }
    }

    draw() {
        this.ctx.fillStyle = '#0d0d12';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Mid-line (Base)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2); this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke(); this.ctx.setLineDash([]);

        this.wall.draw(this.ctx);

        // Highlight winning brick if game over
        if (this.winData && this.winData.brick) {
            const b = this.winData.brick;
            this.ctx.save();
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#ffffff';
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            const rx = b.canvasXPosition - b.width / 2;
            const ry = b.canvasYPosition - b.height / 2;
            this.ctx.beginPath();
            if (this.ctx.roundRect) this.ctx.roundRect(rx, ry, b.width, b.height, 4);
            else this.ctx.rect(rx, ry, b.width, b.height);
            this.ctx.stroke();
            this.ctx.restore();
        }

        this.paddleTop.draw(this.ctx);
        this.paddleBottom.draw(this.ctx);
        for (const b of this.ballsTop) b.draw(this.ctx);
        for (const b of this.ballsBottom) b.draw(this.ctx);
    }
}
