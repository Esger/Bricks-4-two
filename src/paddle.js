export class Paddle {
    constructor(canvas, side, color) {
        this.canvas = canvas;
        this.side = side; // 'top' or 'bottom'
        this.color = color;

        this.DEFAULT_WIDTH = 120;
        this.width = this.DEFAULT_WIDTH;
        this.MIN_WIDTH = 60;
        this.MAX_WIDTH = 240;
        this.height = 15;
        this.y = 0;
        this.widthExpiry = 0;

        this.reset();
    }

    reset() {
        const gameWidth = this.canvas.clientWidth;
        const gameHeight = this.canvas.clientHeight;

        this.width = this.DEFAULT_WIDTH;
        this.widthExpiry = 0;
        this.x = gameWidth / 2;
        if (this.side === 'top') {
            this.y = 20 + this.height / 2;
        } else {
            this.y = gameHeight - 20 - this.height / 2;
        }
    }

    changeWidth(delta, now) {
        this.width = Math.max(this.MIN_WIDTH, Math.min(this.MAX_WIDTH, this.width + delta));
        this.widthExpiry = now + 10000; // 10 seconds duration
        // Keep paddle center within bounds after resize
        this.moveTo(this.x);
    }

    update(now) {
        if (this.widthExpiry > 0 && now > this.widthExpiry) {
            this.width = this.DEFAULT_WIDTH;
            this.widthExpiry = 0;
            this.moveTo(this.x); // Ensure bounds are correct after shrinking/growing back
        }
    }

    moveTo(x) {
        const gameWidth = this.canvas.clientWidth;
        // Keep within bounds
        this.x = Math.max(this.width / 2, Math.min(gameWidth - this.width / 2, x));
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;

        // Glassy effect for paddle
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Arched paddle shape
        const rx = this.x - this.width / 2;
        const ry = this.y - this.height / 2;
        const bulge = 6; // How much the paddle curves out

        ctx.beginPath();
        if (this.side === 'bottom') {
            // Arched top for bottom paddle
            ctx.moveTo(rx, ry + this.height);
            ctx.lineTo(rx + this.width, ry + this.height);
            ctx.lineTo(rx + this.width, ry + bulge);
            ctx.quadraticCurveTo(this.x, ry - bulge, rx, ry + bulge);
        } else {
            // Arched bottom for top paddle
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + this.width, ry);
            ctx.lineTo(rx + this.width, ry + this.height - bulge);
            ctx.quadraticCurveTo(this.x, ry + this.height + bulge, rx, ry + this.height - bulge);
        }
        ctx.closePath();

        ctx.fill();

        // Highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    getBounds() {
        return {
            left: this.x - this.width / 2,
            right: this.x + this.width / 2,
            top: this.y - this.height / 2,
            bottom: this.y + this.height / 2,
            centerY: this.y
        };
    }
}
