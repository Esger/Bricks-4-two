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
    
    // Start overlay handling
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!game.running) {
            game.start();
            overlay.classList.add('hidden');
        }
    }, { passive: false });
    
    overlay.addEventListener('mousedown', () => {
        if (!game.running) {
            game.start();
            overlay.classList.add('hidden');
        }
    });
});
