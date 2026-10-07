import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, commandLabel, VoteBox, giftTier, giftRepeats, LikeMeter, liveOptionsFromURL, normalizeText } from '../src/live/commands.js';
import { craftByName, smeltInventory, nameMatches, findRecipes } from '../src/live/autocraft.js';
import { demoEvent } from '../src/live/demo.js';
import { LiveController, GOALS, esc } from '../src/live/live.js';
import { normalizeChat, normalizeGift, normalizeLike, normalizeViewers, userOf } from '../tools/tiktok-events.js';
import { Inventory } from '../src/inventory.js';
import { B } from '../src/blocks.js';
import { I, toolId } from '../src/items.js';

test('commandes du chat : mots, accents, alias et emojis', () => {
  assert.deepEqual(parseCommand('avance'), { action: 'forward', arg: 3 });
  assert.deepEqual(parseCommand('  Avance 5 !'), { action: 'forward', arg: 5 });
  assert.deepEqual(parseCommand('!AVANCE'), { action: 'forward', arg: 3 });
  assert.deepEqual(parseCommand('avance 99'), { action: 'forward', arg: 12 }, 'plafonné');
  assert.deepEqual(parseCommand('gauche'), { action: 'left', arg: 90 });
  assert.deepEqual(parseCommand('droite 45'), { action: 'right', arg: 45 });
  assert.deepEqual(parseCommand('Demi-tour'), { action: 'turn', arg: null });
  assert.deepEqual(parseCommand('regarde haut'), { action: 'up', arg: null });
  assert.deepEqual(parseCommand('⛏️'), { action: 'mine', arg: 1 });
  assert.deepEqual(parseCommand('⬆️'), { action: 'forward', arg: 3 });
  assert.deepEqual(parseCommand('creuse 3'), { action: 'tunnel', arg: 3 });
  assert.deepEqual(parseCommand('3'), { action: 'slot', arg: 3 });
  assert.deepEqual(parseCommand('fabrique pioche en pierre'), { action: 'craft', arg: 'pioche en pierre', count: 1 });
  assert.deepEqual(parseCommand('fabrique torches x3'), { action: 'craft', arg: 'torches', count: 3 });
  assert.deepEqual(parseCommand('prends épée'), { action: 'take', arg: 'epee' });
  assert.deepEqual(parseCommand('jump'), { action: 'jump', arg: null });
  assert.equal(parseCommand('trop fort ce live'), null);
  assert.equal(parseCommand('fabrique'), null, 'il faut dire quoi');
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand('avance '.repeat(20)), null, 'les pavés sont ignorés');
  assert.equal(normalizeText('Épée'), 'epee');
});

test('libellés et vote', () => {
  assert.equal(commandLabel({ action: 'forward', arg: 3 }), '⬆️ avance');
  assert.equal(commandLabel({ action: 'forward', arg: 5 }), '⬆️ avance 5');
  assert.equal(commandLabel({ action: 'left', arg: 45 }), '↩️ gauche 45°');
  const box = new VoteBox();
  assert.ok(box.add('a', parseCommand('mine')));
  assert.ok(box.add('b', parseCommand('avance')));
  assert.ok(box.add('c', parseCommand('Mine !')));
  assert.equal(box.add('a', parseCommand('avance')), false, 'une voix par personne');
  assert.equal(box.size, 3);
  assert.equal(box.winner().cmd.action, 'mine');
  assert.equal(box.winner().n, 2);
  box.reset();
  assert.equal(box.winner(), null);
});

test('cadeaux et likes', () => {
  assert.equal(giftTier(1).id, 'zombie');
  assert.equal(giftTier(5).id, 'creeper');
  assert.equal(giftTier(29).id, 'tnt');
  assert.equal(giftTier(30).id, 'kit');
  assert.equal(giftTier(44999).id, 'nuke');
  assert.equal(giftTier(undefined).id, 'zombie');
  assert.equal(giftRepeats(25), 10);
  assert.equal(giftRepeats(0), 1);
  const m = new LikeMeter(100);
  assert.equal(m.add(40), 0);
  assert.equal(m.add(250), 2);
  assert.equal(m.value, 90);
  assert.equal(m.total, 290);
});

test('options du mode LIVE dans l’adresse', () => {
  assert.equal(liveOptionsFromURL('?seed=1'), null);
  assert.deepEqual(liveOptionsFromURL('?live'), { source: 'bridge', control: 'chat', vote: false, fresh: false, mode: 'survival', seed: '' });
  const o = liveOptionsFromURL('?live=demo&vote&controle=streamer&nouveau&mode=créatif&graine=abc');
  assert.deepEqual(o, { source: 'demo', control: 'streamer', vote: true, fresh: true, mode: 'creative', seed: 'abc' });
});

test('artisanat à la voix', () => {
  const inv = new Inventory();
  inv.add({ id: B.OAK_LOG, count: 3 });
  assert.equal(craftByName(inv, 'pioche').reason, 'missing');
  let r = craftByName(inv, 'planches');
  assert.ok(r.ok);
  assert.equal(r.id, B.OAK_PLANKS);
  assert.equal(inv.count(B.OAK_PLANKS), 4);
  assert.equal(inv.count(B.OAK_LOG), 2);
  r = craftByName(inv, 'planches', { times: 5 });
  assert.equal(r.count, 8, 'autant que possible');
  assert.equal(inv.count(B.OAK_LOG), 0);
  assert.ok(craftByName(inv, 'batons').ok);
  assert.equal(inv.count(I.STICK), 4);
  assert.equal(inv.count(B.OAK_PLANKS), 10);
  assert.ok(craftByName(inv, 'table').ok, 'une recette 2×2 se fait sans table');
  assert.equal(craftByName(inv, 'pioche en bois').reason, 'table', '3×3 : il faut une table');
  r = craftByName(inv, 'pioche', { table: true });
  assert.ok(r.ok);
  assert.equal(r.id, toolId('wooden', 'pickaxe'));
  assert.equal(inv.count(I.STICK), 2);
  assert.equal(craftByName(inv, 'zzz').reason, 'unknown');
  // La meilleure pioche possible est choisie.
  inv.add({ id: B.COBBLESTONE, count: 3 });
  assert.equal(craftByName(inv, 'pioche', { table: true }).id, toolId('stone', 'pickaxe'));
  assert.ok(nameMatches('torches', B.TORCH));
  assert.ok(nameMatches('épée diamant', toolId('diamond', 'sword')));
  assert.ok(!nameMatches('epee', toolId('diamond', 'pickaxe')));
  assert.ok(findRecipes('four').length >= 1);
});

test('cuisson à la voix', () => {
  const inv = new Inventory();
  inv.add({ id: B.IRON_ORE, count: 3 });
  assert.equal(smeltInventory(inv).reason, 'fuel');
  inv.add({ id: I.COAL, count: 1 });
  inv.add({ id: I.BEEF, count: 2 });
  const r = smeltInventory(inv);
  assert.ok(r.ok);
  assert.equal(inv.count(I.STEAK), 2, 'la nourriture d’abord');
  assert.equal(inv.count(I.IRON_INGOT), 3);
  assert.equal(inv.count(I.COAL), 0);
  assert.equal(inv.count(B.IRON_ORE), 0);
  assert.equal(smeltInventory(inv).reason, 'nothing');
  // Bûches : on en brûle pour cuire les autres.
  const inv2 = new Inventory();
  inv2.add({ id: B.SAND, count: 2 });
  inv2.add({ id: B.OAK_PLANKS, count: 2 });
  assert.ok(smeltInventory(inv2).ok);
  assert.equal(inv2.count(B.GLASS), 2);
  assert.equal(inv2.count(B.OAK_PLANKS), 0);
});

test('événements TikTok (anciens objets et protobuf v3)', () => {
  assert.deepEqual(userOf({ uniqueId: 'lea', nickname: 'Léa' }), { id: 'lea', name: 'Léa' });
  assert.deepEqual(userOf({ displayId: 'tom', nickname: '' }), { id: 'tom', name: 'tom' });
  assert.deepEqual(normalizeChat({ user: { uniqueId: 'a', nickname: 'A' }, comment: 'avance' }), { type: 'chat', user: { id: 'a', name: 'A' }, text: 'avance' });
  assert.equal(normalizeChat({ user: { displayId: 'b' }, content: 'mine' }).text, 'mine');
  assert.equal(normalizeChat({ content: '' }), null);
  // Série en cours : ignorée ; fin de série : comptée.
  assert.equal(normalizeGift({ giftType: 1, repeatEnd: false, repeatCount: 3, diamondCount: 1 }), null);
  assert.equal(normalizeGift({ gift: { type: 1, diamondCount: 1, name: 'Rose' }, repeatEnd: 0, repeatCount: 3 }), null);
  const g = normalizeGift({ user: { displayId: 'c' }, gift: { type: 1, diamondCount: 1, name: 'Rose', id: '5655' }, repeatEnd: 1, repeatCount: 7, giftId: '5655' });
  assert.deepEqual(g.gift, { id: '5655', name: 'Rose', coins: 1, count: 7 });
  const legacy = normalizeGift({ user: { uniqueId: 'd' }, giftType: 2, diamondCount: 99, giftName: 'Chapeau', repeatCount: 1 });
  assert.equal(legacy.gift.coins, 99);
  assert.equal(legacy.gift.name, 'Chapeau');
  assert.deepEqual(normalizeLike({ user: { uniqueId: 'e' }, likeCount: 15, totalLikeCount: 1200 }), { type: 'like', user: { id: 'e', name: 'e' }, likes: 15, total: 1200 });
  assert.equal(normalizeLike({ count: 4, total: '88' }).total, 88);
  assert.deepEqual(normalizeViewers({ viewerCount: 42 }), { type: 'viewers', viewers: 42 });
  assert.equal(normalizeViewers({}), null);
});

test('spectateurs simulés : messages valides', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const types = new Set();
  for (let i = 0; i < 500; i++) {
    const ev = demoEvent(rnd);
    types.add(ev.type);
    assert.ok(ev.user && ev.user.id && ev.user.name);
    if (ev.type === 'gift') assert.ok(ev.gift.coins >= 1 && ev.gift.count >= 1);
  }
  for (const t of ['chat', 'like', 'gift', 'follow']) assert.ok(types.has(t), t);
});

test('objectifs du LIVE : un objectif plus avancé valide ceux d’avant', () => {
  const inv = new Inventory();
  const feed = [];
  const live = Object.create(LiveController.prototype);
  live.game = { meta: {}, player: { inventory: inv }, isCreative: () => false, playSound() {} };
  live.overlay = { feed: (h) => feed.push(h), banner() {}, setGoal() {} };
  live.checkGoals();
  assert.equal(live.stats.goal, 0);
  inv.add({ id: B.OAK_LOG, count: 4 });
  live.checkGoals();
  assert.equal(live.stats.goal, 1);
  inv.clear();
  inv.add({ id: toolId('wooden', 'pickaxe'), count: 1 });
  live.checkGoals();
  assert.equal(live.stats.goal, 3, 'la table a été posée entre deux vérifications : elle compte quand même');
  inv.clear();
  live.checkGoals();
  assert.equal(live.stats.goal, 3, 'on ne recule jamais');
  inv.add({ id: I.DIAMOND, count: 1 });
  live.checkGoals();
  assert.equal(live.stats.goal, GOALS.length);
  assert.equal(feed.length, GOALS.length);
  assert.equal(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
