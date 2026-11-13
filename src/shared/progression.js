// Système de niveaux : XP, rangs, déblocages. Partagé client / serveur.
export const MAX_LEVEL = 55;

export const XP = {
  kill: 100, headshot: 50, melee: 50, wave: 250, match: 200, win: 500, streak: 150,
};

/** XP cumulée nécessaire pour atteindre le niveau n (niveau 1 = 0). */
export function xpForLevel(n) {
  if (n <= 1) return 0;
  let t = 0;
  for (let i = 1; i < n; i++) t += 800 + i * 220;
  return t;
}

export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function levelProgress(xp) {
  const l = levelFromXp(xp);
  if (l >= MAX_LEVEL) return { level: l, cur: 1, need: 1, ratio: 1 };
  const a = xpForLevel(l), b = xpForLevel(l + 1);
  return { level: l, cur: xp - a, need: b - a, ratio: (xp - a) / (b - a) };
}

const RANKS = [
  [1, 'Recrue'], [3, 'Soldat'], [6, 'Soldat 1re classe'], [9, 'Caporal'], [12, 'Caporal-chef'], [15, 'Sergent'],
  [19, 'Sergent-chef'], [23, 'Adjudant'], [27, 'Major'], [31, 'Sous-lieutenant'], [35, 'Lieutenant'], [39, 'Capitaine'],
  [43, 'Commandant'], [47, 'Lieutenant-colonel'], [51, 'Colonel'], [55, 'Général'],
];

export function rankName(level) {
  let n = RANKS[0][1];
  for (const [l, name] of RANKS) if (level >= l) n = name;
  return n;
}

/** XP gagnée pour une partie (bornée côté serveur). */
export function matchXp(r) {
  const n = (v, m) => Math.max(0, Math.min(m, Math.floor(Number(v) || 0)));
  return n(r.kills, 300) * XP.kill + n(r.headshots, 300) * XP.headshot + n(r.wave, 100) * XP.wave + XP.match + (r.win ? XP.win : 0);
}
