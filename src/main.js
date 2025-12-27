import { Game } from './game.js';

window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);

    let lastRendered = true;
    function loop(now) {
        if (game.running) {
            game.update(now);
            game.draw();
            lastRendered = true;
        } else if (lastRendered) {
            // Draw one final frame after game stops to show the winning state
            game.draw();
            lastRendered = false;
        }
        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Resize handler
    window.addEventListener('resize', () => {
        game.resize();
    });
});
