// Point d'entrée : crée le jeu, l'interface et branche les événements globaux.
import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { TouchControls } from './ui/touch.js';
import { openStorage, loadSettings } from './storage.js';
import { GameAudio } from './audio.js';
import { liveOptionsFromURL } from './live/commands.js';

function fatal(message) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = true;
  const screen = document.getElementById('screen-error');
  document.getElementById('error-text').textContent = message;
  screen.style.backgroundColor = '#241b14';
  screen.hidden = false;
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const settings = loadSettings(touch);
  const storage = await openStorage();
  const audio = new GameAudio();
  document.body.classList.toggle('touch', touch);

  let game;
  try {
    game = new Game({ canvas, storage, audio, settings, touch });
  } catch (e) {
    console.error(e);
    fatal('Votre navigateur ne prend pas en charge WebGL2, nécessaire pour afficher le monde en 3D. Essayez une version récente de Chrome, Firefox, Edge ou Safari. (' + e.message + ')');
    return;
  }
  const ui = new UI(game);
  game.ui = ui;
  if (touch) new TouchControls(game);
  const liveOpts = liveOptionsFromURL(location.search);
  if (liveOpts) {
    // Mode LIVE TikTok : chargé seulement quand on le demande (?live ou ?live=demo).
    const { LiveController } = await import('./live/live.js');
    game.live = new LiveController(game, liveOpts);
    await game.startLiveWorld(liveOpts);
    game.live.start();
  } else {
    game.startTitle();
    ui.showTitle();
  }

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (game.state === 'playing' && !game.live) game.pause(); // en LIVE, le jeu continue même en arrière-plan
    else game.save();
  });
  window.addEventListener('pagehide', () => game.save());
  window.addEventListener('resize', () => game.renderer.resize());
  window.mcweb = game; // pratique pour expérimenter dans la console
}

boot().catch((e) => {
  console.error(e);
  fatal('Erreur au démarrage : ' + e.message);
});
