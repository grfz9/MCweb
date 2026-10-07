// Mode LIVE : lecture des commentaires du chat (« avance », « mine », « fabrique pioche »…) et
// barème des cadeaux. Module pur (sans DOM), testé avec node --test.

// Minuscules, sans accents ni ponctuation de tête (« !Avance » → « avance »).
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/^[\s!/.#@>-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMOJI = [
  [/^(⬆️?|↑|🔼)/u, 'avance'], [/^(⬇️?|↓|🔽)/u, 'recule'], [/^(⬅️?|←|◀️?)/u, 'gauche'], [/^(➡️?|→|▶️?)/u, 'droite'],
  [/^⛏️?/u, 'mine'], [/^(⚔️?|🗡️?)/u, 'attaque'], [/^(🧱|🟫)/u, 'pose'], [/^(🍖|🍗|🍞)/u, 'mange'], [/^(🦘|⏫)/u, 'saute'],
];

// Réglages du mode LIVE lus dans l'adresse : ?live (pont TikTok) ou ?live=demo, &controle=streamer, &vote,
// &nouveau (nouveau monde), &mode=creatif, &graine=… Renvoie null hors mode LIVE.
export function liveOptionsFromURL(search) {
  const q = new URLSearchParams(search);
  if (!q.has('live')) return null;
  const mode = normalizeText(q.get('mode') || '');
  return {
    source: normalizeText(q.get('live') || '') === 'demo' ? 'demo' : 'bridge',
    control: normalizeText(q.get('controle') || q.get('control') || '').startsWith('stream') ? 'streamer' : 'chat',
    vote: q.has('vote'),
    fresh: q.has('nouveau') || q.has('new'),
    mode: ['c', '1', 'creatif', 'creative'].includes(mode) ? 'creative' : 'survival',
    seed: q.get('graine') || q.get('seed') || '',
  };
}

// Alias (sans accents) → action. Les lettres seules reprennent les touches du jeu (ZQSD / WASD).
const ALIASES = {
  forward: ['avance', 'avancer', 'avances', 'av', 'devant', 'go', 'forward', 'z', 'w'],
  back: ['recule', 'reculer', 'recules', 'arriere', 'back', 's'],
  left: ['gauche', 'g', 'left', 'q'],
  right: ['droite', 'dr', 'd', 'right'],
  turn: ['demitour', 'demi tour', 'retourne', 'retour', '180', 'turn'],
  jump: ['saute', 'sauter', 'saut', 'jump', 'j', 'hop', 'espace'],
  up: ['haut', 'up', 'leve', 'regarde haut', 'en haut'],
  down: ['bas', 'down', 'baisse', 'regarde bas', 'en bas'],
  level: ['droit', 'face', 'horizon', 'regarde devant', 'tout droit'],
  mine: ['mine', 'miner', 'mines', 'casse', 'casser', 'dig', 'break', 'm'],
  tunnel: ['creuse', 'creuser', 'tunnel', 'c'],
  place: ['pose', 'poser', 'place', 'construis', 'build', 'bloc', 'p'],
  pillar: ['pilier', 'tour', 'monte', 'pillar'],
  attack: ['attaque', 'attaquer', 'tape', 'taper', 'frappe', 'frapper', 'tue', 'attack', 'hit', 'kill', 'k'],
  eat: ['mange', 'manger', 'eat', 'miam'],
  sprint: ['cours', 'courir', 'sprint', 'run', 'fonce'],
  slot: ['slot', 'case', 'emplacement'],
  take: ['prends', 'prend', 'choisis', 'equipe', 'take', 'select'],
  craft: ['fabrique', 'fabriquer', 'craft', 'crafte', 'crafter'],
  smelt: ['cuis', 'cuire', 'four', 'fonds', 'fondre', 'smelt'],
};

const LOOKUP = new Map();
for (const [action, words] of Object.entries(ALIASES)) for (const w of words) LOOKUP.set(w, action);

// Ce que le chat voit à l'écran (dans cet ordre).
export const COMMAND_HELP = [
  ['avance', 'avancer'], ['gauche · droite', 'tourner'], ['saute', 'sauter'], ['mine', 'casser'],
  ['creuse', 'tunnel'], ['pose', 'poser'], ['attaque', 'frapper'], ['fabrique …', 'crafter'],
];

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

// Renvoie { action, arg } ou null si le message n'est pas une commande.
export function parseCommand(text) {
  let raw = String(text ?? '').trim();
  if (!raw || raw.length > 60) return null;
  for (const [re, word] of EMOJI) if (re.test(raw)) { raw = word + raw.replace(re, ''); break; }
  const t = normalizeText(raw).replace(/-/g, ' ');
  if (!t) return null;

  if (/^[1-9]$/.test(t)) return { action: 'slot', arg: Number(t) };
  const words = t.split(' ');
  // Alias en deux mots d'abord (« demi tour », « regarde haut »), puis en un mot.
  let action = null, rest = [];
  if (words.length >= 2 && LOOKUP.has(words[0] + ' ' + words[1])) { action = LOOKUP.get(words[0] + ' ' + words[1]); rest = words.slice(2); }
  else if (LOOKUP.has(words[0])) { action = LOOKUP.get(words[0]); rest = words.slice(1); }
  if (!action) return null;

  const num = rest.length ? parseFloat(rest[0].replace(/^x/, '')) : NaN;
  switch (action) {
    case 'forward': case 'back': case 'sprint':
      return { action, arg: Number.isFinite(num) ? clampInt(num, 1, 12) : action === 'sprint' ? 8 : 3 };
    case 'left': case 'right':
      return { action, arg: Number.isFinite(num) ? clampInt(num, 5, 180) : 90 };
    case 'slot':
      return Number.isFinite(num) && num >= 1 && num <= 9 ? { action, arg: Math.floor(num) } : null;
    case 'take':
      return rest.length ? { action, arg: rest.join(' ') } : null;
    case 'craft': {
      if (!rest.length) return null;
      let count = 1;
      const last = rest[rest.length - 1].replace(/^x/, '');
      if (rest.length > 1 && /^\d+$/.test(last)) { count = clampInt(Number(last), 1, 8); rest = rest.slice(0, -1); }
      return { action, arg: rest.join(' '), count };
    }
    case 'mine': case 'tunnel': case 'pillar':
      return { action, arg: Number.isFinite(num) ? clampInt(num, 1, 6) : 1 };
    default:
      return { action, arg: null };
  }
}

// Libellé court affiché dans le fil (« avance 3 », « fabrique pioche »).
const LABELS = {
  forward: 'avance', back: 'recule', left: 'gauche', right: 'droite', turn: 'demi-tour', jump: 'saute', up: 'regarde en haut',
  down: 'regarde en bas', level: 'regarde devant', mine: 'mine', tunnel: 'creuse', place: 'pose', pillar: 'pilier',
  attack: 'attaque', eat: 'mange', sprint: 'court', slot: 'case', take: 'prend', craft: 'fabrique', smelt: 'cuit',
};
const ICONS = {
  forward: '⬆️', back: '⬇️', left: '↩️', right: '↪️', turn: '🔄', jump: '🦘', up: '👆', down: '👇', level: '👀', mine: '⛏️',
  tunnel: '🕳️', place: '🧱', pillar: '🗼', attack: '⚔️', eat: '🍖', sprint: '🏃', slot: '🎒', take: '🎒', craft: '🛠️', smelt: '🔥',
};

export function commandLabel(cmd) {
  const base = LABELS[cmd.action] || cmd.action;
  const icon = ICONS[cmd.action] || '';
  let extra = '';
  if (cmd.action === 'left' || cmd.action === 'right') extra = cmd.arg !== 90 ? ` ${cmd.arg}°` : '';
  else if (cmd.action === 'forward' || cmd.action === 'back') extra = cmd.arg !== 3 ? ` ${cmd.arg}` : '';
  else if (['slot', 'mine', 'tunnel', 'pillar'].includes(cmd.action)) extra = cmd.arg > 1 || cmd.action === 'slot' ? ` ${cmd.arg}` : '';
  else if (cmd.action === 'take' || cmd.action === 'craft') extra = ` ${cmd.arg}`;
  return `${icon} ${base}${extra}`.trim();
}

// Clé de vote : deux messages « avance » et « Avance ! » votent pour la même chose.
export function commandKey(cmd) {
  return cmd.action + (cmd.arg !== null && cmd.arg !== undefined ? ':' + cmd.arg : '');
}

// Mode vote : la commande la plus demandée l'emporte (à égalité, la première arrivée).
export class VoteBox {
  constructor() { this.reset(); }

  reset() {
    this.votes = new Map();
    this.voters = new Set();
    this.order = 0;
  }

  add(userId, cmd) {
    if (this.voters.has(userId)) return false; // une voix par personne et par tour
    this.voters.add(userId);
    const key = commandKey(cmd);
    const v = this.votes.get(key);
    if (v) v.n++;
    else this.votes.set(key, { cmd, n: 1, first: this.order++, user: userId });
    return true;
  }

  get size() { return this.voters.size; }

  // Les choix triés (pour l'affichage) : [{ cmd, n }]
  ranking() {
    return [...this.votes.values()].sort((a, b) => b.n - a.n || a.first - b.first);
  }

  winner() {
    const r = this.ranking();
    return r.length ? r[0] : null;
  }
}

// ---------------------------------------------------------------------------- cadeaux
// Paliers en pièces TikTok (valeur d'UN cadeau). Les cadeaux envoyés en série (×N) déclenchent l'effet N fois.
export const GIFT_TIERS = [
  { min: 1, id: 'zombie', icon: '🧟', label: 'Zombie à ton nom' },
  { min: 5, id: 'creeper', icon: '💚', label: 'Creeper à ton nom' },
  { min: 10, id: 'tnt', icon: '🧨', label: 'Pluie de TNT' },
  { min: 30, id: 'kit', icon: '🎁', label: 'Kit de survie' },
  { min: 99, id: 'horde', icon: '☠️', label: 'Horde de monstres' },
  { min: 199, id: 'launch', icon: '🚀', label: 'Décollage !' },
  { min: 299, id: 'diamonds', icon: '💎', label: 'Pluie de diamants' },
  { min: 500, id: 'nuke', icon: '☢️', label: 'Méga TNT' },
];

export function giftTier(coins) {
  const c = Number(coins) || 1;
  let tier = GIFT_TIERS[0];
  for (const t of GIFT_TIERS) if (c >= t.min) tier = t;
  return tier;
}

// Nombre de déclenchements pour une série de cadeaux (plafonné pour ne pas noyer le monde).
export function giftRepeats(count, max = 10) {
  return Math.max(1, Math.min(max, Math.floor(Number(count) || 1)));
}

// Jauge de likes : renvoie le nombre de paliers franchis par cet ajout.
export class LikeMeter {
  constructor(goal = 100) {
    this.goal = goal;
    this.value = 0;
    this.total = 0;
  }

  add(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    this.total += n;
    this.value += n;
    let reached = 0;
    while (this.value >= this.goal) { this.value -= this.goal; reached++; }
    return reached;
  }

  get progress() { return this.value / this.goal; }
}
