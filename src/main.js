import { Game } from './game.js';

window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);

    function loop(now) {
        game.update(now);
        game.draw();
        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Resize handler
    window.addEventListener('resize', () => {
        game.resize();
    });
});
