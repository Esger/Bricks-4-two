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

        this.ballTop = new Ball(canvas, 'top', '#ff6b6b');
        this.ballBottom = new Ball(canvas, 'bottom', '#6ba5ff');

        this.wall = new Wall(canvas);

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

            // Top half controls top paddle, bottom half controls bottom paddle
            if (y < this.height / 2) {
                this.paddleTop.moveTo(x);
            } else {
                this.paddleBottom.moveTo(x);
            }
        };

        this.canvas.addEventListener('pointermove', handlePointer);
        this.canvas.addEventListener('pointerdown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (y < this.height / 2) {
                this.ballTop.launch(this.paddleTop.x, x, y);
            } else {
                this.ballBottom.launch(this.paddleBottom.x, x, y);
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
        this.ballTop.reset();
        this.ballBottom.reset();
        this.wall.initializeWall();
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
        // Placeholder for brick displacement logic
        console.log('Wall hit by', ball.side);
    }

    update(now) {
        if (!this.running) return;

        this.ballTop.update(this);
        this.ballBottom.update(this);
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
        this.ballTop.draw(this.ctx);
        this.ballBottom.draw(this.ctx);
    }
}
