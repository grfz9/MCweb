// Spectateurs simulés : pour répéter un LIVE sans être en direct (navigateur : ?live=demo ; serveur : --demo).
// Produit exactement les mêmes messages que le pont TikTok (tools/live.js).

const NAMES = [
  'lea_mc', 'tom.creeper', 'yanis_77', 'manon.pixel', 'enzo_le_bg', 'ines_craft', 'noah.blocks', 'jade_zzz',
  'lucas_tnt', 'camille.diams', 'hugo_mineur', 'sarah_lava', 'adam.steve', 'lina_slime', 'nathan_ender', 'chloe_xx',
];
const SAYS = [
  'avance', 'avance', 'avance 5', 'gauche', 'droite', 'saute', 'mine', 'mine', 'creuse', 'creuse', 'attaque', 'pose',
  'demi-tour', 'recule', 'haut', 'bas', 'cours', 'fabrique planches', 'fabrique table', 'fabrique pioche', 'fabrique batons',
  'pilier', 'mange', 'cuis', '⬆️', '⛏️', 'Avance !', 'droite 45',
];
const BANTER = ['trop fort 😂', 'il va mourir', 'GG', 'mets des torches', 'cherche des diamants !', 'c’est quoi ce jeu ?', 'lol'];
const GIFTS = [
  { name: 'Rose', coins: 1, w: 30 }, { name: 'GG', coins: 1, w: 12 }, { name: 'Cœur avec les doigts', coins: 5, w: 14 },
  { name: 'Rosa', coins: 10, w: 9 }, { name: 'Beignet', coins: 30, w: 6 }, { name: 'Chapeau et moustache', coins: 99, w: 3 },
  { name: 'Lettre d’amour', coins: 199, w: 2 }, { name: 'Corgi', coins: 299, w: 1.5 }, { name: 'Feu d’artifice', coins: 1088, w: 0.6 },
];

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
function weighted(list, rnd) {
  let r = rnd() * list.reduce((s, g) => s + g.w, 0);
  for (const g of list) if ((r -= g.w) <= 0) return g;
  return list[0];
}

export function demoEvent(rnd = Math.random) {
  const name = pick(NAMES, rnd);
  const user = { id: name, name };
  const r = rnd();
  if (r < 0.66) return { type: 'chat', user, text: pick(SAYS, rnd) };
  if (r < 0.71) return { type: 'chat', user, text: pick(BANTER, rnd) };
  if (r < 0.87) return { type: 'like', user, likes: 1 + Math.floor(rnd() * 15), total: null };
  if (r < 0.95) {
    const g = weighted(GIFTS, rnd);
    const count = g.coins === 1 && rnd() < 0.4 ? 2 + Math.floor(rnd() * 8) : 1;
    return { type: 'gift', user, gift: { id: '', name: g.name, coins: g.coins, count } };
  }
  if (r < 0.985) return { type: 'follow', user };
  return { type: 'share', user };
}

// Lance le flux simulé ; renvoie une fonction d'arrêt. `speed` = événements par seconde (en moyenne).
export function startDemoFeed(emit, { speed = 1.4, rnd = Math.random } = {}) {
  let viewers = 40 + Math.floor(rnd() * 60);
  let timer = null, stopped = false;
  emit({ type: 'status', state: 'live', user: 'demo', message: 'Démo : spectateurs simulés' });
  emit({ type: 'viewers', viewers });
  const next = () => {
    if (stopped) return;
    emit(demoEvent(rnd));
    if (rnd() < 0.08) {
      viewers = Math.max(3, viewers + Math.round((rnd() - 0.45) * 12));
      emit({ type: 'viewers', viewers });
    }
    timer = setTimeout(next, (-Math.log(1 - rnd()) / speed) * 1000);
  };
  timer = setTimeout(next, 600);
  return () => { stopped = true; clearTimeout(timer); };
}
