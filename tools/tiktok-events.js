// Convertit les événements de tiktok-live-connector en messages simples pour le jeu.
// Accepte les deux formes de la bibliothèque : objets protobuf v3 (user.displayId, content, gift.diamondCount,
// count/total) et anciens objets « à plat » (uniqueId, comment, diamondCount, likeCount…).

export function userOf(u) {
  const id = String(u?.uniqueId || u?.displayId || '').trim();
  const name = String(u?.nickname || id || 'anonyme').trim().slice(0, 32);
  return { id: id || name, name };
}

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

export function normalizeChat(d) {
  const text = String(d?.comment ?? d?.content ?? '').trim();
  if (!text) return null;
  return { type: 'chat', user: userOf(d.user), text: text.slice(0, 200) };
}

// Les cadeaux « en série » (giftType 1) arrivent plusieurs fois : on ne garde que la fin de la série.
export function normalizeGift(d) {
  if (!d) return null;
  const details = d.giftDetails || d.gift || {};
  const ext = d.extendedGiftInfo || {};
  const giftType = Number(d.giftType ?? details.giftType ?? details.type ?? 0);
  if (giftType === 1 && !truthy(d.repeatEnd)) return null;
  const coins = Number(d.diamondCount ?? details.diamondCount ?? ext.diamond_count ?? ext.diamondCount ?? 1) || 1;
  return {
    type: 'gift',
    user: userOf(d.user),
    gift: {
      id: String(d.giftId ?? details.id ?? ''),
      name: String(d.giftName ?? details.giftName ?? details.name ?? ext.name ?? 'Cadeau'),
      coins,
      count: Math.max(1, Number(d.repeatCount) || 1),
    },
  };
}

export function normalizeLike(d) {
  const likes = Math.max(1, Number(d?.likeCount ?? d?.count) || 1);
  const total = Number(d?.totalLikeCount ?? d?.total);
  return { type: 'like', user: userOf(d?.user), likes, total: Number.isFinite(total) && total > 0 ? total : null };
}

export function normalizeSocial(type, d) {
  return { type, user: userOf(d?.user) };
}

export function normalizeViewers(d) {
  const n = Number(d?.viewerCount ?? d?.total ?? d?.totalUser);
  return Number.isFinite(n) ? { type: 'viewers', viewers: n } : null;
}
