export class Paddle {
    constructor(canvas, side, color) {
        this.canvas = canvas;
        this.side = side; // 'top' or 'bottom'
        this.color = color;

        this.width = 120;
        this.height = 15;
        this.x = 0; // Center x
        this.y = 0;

        this.reset();
    }

    reset() {
        const gameWidth = this.canvas.clientWidth;
        const gameHeight = this.canvas.clientHeight;

        this.x = gameWidth / 2;
        if (this.side === 'top') {
            this.y = 20 + this.height / 2;
        } else {
            this.y = gameHeight - 20 - this.height / 2;
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

        ctx.beginPath();
        const rx = this.x - this.width / 2;
        const ry = this.y - this.height / 2;

        // Rounded rectangle
        const radius = 5;
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + this.width - radius, ry);
        ctx.quadraticCurveTo(rx + this.width, ry, rx + this.width, ry + radius);
        ctx.lineTo(rx + this.width, ry + this.height - radius);
        ctx.quadraticCurveTo(rx + this.width, ry + this.height, rx + this.width - radius, ry + this.height);
        ctx.lineTo(rx + radius, ry + this.height);
        ctx.quadraticCurveTo(rx, ry + this.height, rx, ry + this.height - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
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
            bottom: this.y + this.height / 2
        };
    }
}
