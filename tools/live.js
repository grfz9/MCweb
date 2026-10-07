// Pont TikTok LIVE → MCweb.
//   npm run live -- @pseudo          se connecte au LIVE de @pseudo et sert le jeu
//   npm run live -- --demo           spectateurs simulés (pour régler OBS sans être en direct)
// Puis ouvrez http://localhost:8080/?live (source « Navigateur » d'OBS ou de TikTok LIVE Studio).
// Les événements (commentaires, cadeaux, likes, abonnements, partages) sont relayés au jeu en
// Server-Sent Events sur /live/events.
import http from 'node:http';
import { serveStatic } from './serve.js';
import { normalizeChat, normalizeGift, normalizeLike, normalizeSocial, normalizeViewers } from './tiktok-events.js';
import { startDemoFeed } from '../src/live/demo.js';

const args = process.argv.slice(2);
const demo = args.includes('--demo');
const positional = args.filter((a) => !a.startsWith('--'));
// Arguments dans n'importe quel ordre : un nombre = le port, le reste = le pseudo (ou l'adresse du LIVE).
const port = Number(positional.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const username = String(positional.find((a) => !/^\d+$/.test(a)) || process.env.TIKTOK_USER || '')
  .replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/\/live.*$/, '').replace(/^@/, '').trim();

if (!username && !demo) {
  console.log('Usage : npm run live -- @votre_pseudo   (ou --demo pour des spectateurs simulés)');
  process.exit(1);
}

// ------------------------------------------------------------------ diffusion vers les pages du jeu
const clients = new Set();
let status = { type: 'status', state: 'connecting', user: username, message: '' };
let lastViewers = null;

function broadcast(msg) {
  if (!msg) return;
  if (msg.type === 'viewers') lastViewers = msg;
  if (msg.type === 'status') status = msg; // les pages qui se connectent plus tard reçoivent l'état actuel
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
}

function setStatus(state, message) {
  broadcast({ type: 'status', state, user: username || 'demo', message });
  console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${message}`);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/live/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify(status)}\n\n`);
    if (lastViewers) res.write(`data: ${JSON.stringify(lastViewers)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (pathname === '/live/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ ...status, pages: clients.size }));
    return;
  }
  serveStatic(req, res);
});

setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 15000).unref();

server.listen(port, () => {
  console.log(`\nMCweb LIVE${demo ? ' (démo)' : ` pour @${username}`} : http://localhost:${port}/?live`);
  console.log('→ Ajoutez cette adresse comme source « Navigateur » (1080 × 1920) dans OBS ou TikTok LIVE Studio.\n');
  if (demo) startDemoFeed(broadcast);
  else connectTikTok();
});

// ------------------------------------------------------------------ connexion à TikTok
async function connectTikTok() {
  let lib;
  try {
    lib = await import('tiktok-live-connector');
  } catch {
    setStatus('error', 'Module tiktok-live-connector introuvable : lancez « npm install » dans le dossier du jeu.');
    return;
  }
  // Pas d'enableExtendedGiftInfo : la liste des cadeaux demande un abonnement payant Euler Stream,
  // et chaque événement « gift » contient déjà son prix (gift.diamondCount).
  const options = { processInitialData: false, enableExtendedGiftInfo: false };
  if (process.env.EULER_API_KEY) options.signApiKey = process.env.EULER_API_KEY;
  const conn = new lib.TikTokLiveConnection(username, options);

  conn.on('chat', (d) => broadcast(normalizeChat(d)));
  conn.on('gift', (d) => broadcast(normalizeGift(d)));
  conn.on('like', (d) => broadcast(normalizeLike(d)));
  conn.on('follow', (d) => broadcast(normalizeSocial('follow', d)));
  conn.on('share', (d) => broadcast(normalizeSocial('share', d)));
  conn.on('roomUser', (d) => broadcast(normalizeViewers(d)));
  conn.on('streamEnd', () => setStatus('offline', `Le LIVE de @${username} est terminé.`));
  conn.on('error', (e) => { if (conn.isConnected) console.error('Erreur TikTok :', e?.info || e?.exception?.message || e?.message || e); });

  let timer = null, failures = 0;
  const retry = (seconds) => {
    clearTimeout(timer);
    timer = setTimeout(attempt, seconds * 1000);
  };
  conn.on('disconnected', () => {
    setStatus('offline', 'Connexion au LIVE perdue, reconnexion…');
    retry(5);
  });

  async function attempt() {
    if (conn.isConnected || conn.isConnecting) return;
    setStatus('connecting', `Connexion au LIVE de @${username}…`);
    try {
      const state = await conn.connect();
      failures = 0;
      setStatus('live', `Connecté au LIVE de @${username} (salle ${state.roomId}).`);
    } catch (e) {
      const offline = e instanceof lib.UserOfflineError || /offline|not live/i.test(String(e?.message));
      failures++;
      const wait = offline ? 30 : Math.min(60, 5 * 2 ** Math.min(failures, 4));
      setStatus(offline ? 'offline' : 'error',
        offline ? `@${username} n'est pas en LIVE pour l'instant. Nouvel essai dans ${wait} s.`
          : `Connexion impossible (${e?.message || e}). Nouvel essai dans ${wait} s.`);
      retry(wait);
    }
  }
  attempt();
}
