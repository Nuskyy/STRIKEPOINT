// Accessoires, classes et calcul des statistiques modifiées. Partagé client / serveur.
import { WEAPON_STATS, PRIMARIES } from './stats.js';

export const SLOTS = {
  optic: 'Viseur', muzzle: 'Bouche', underbarrel: 'Sous le canon', mag: 'Chargeur',
};

export const ATTACHMENTS = {
  optic: {
    iron: { name: 'Organes de visée', level: 1, desc: 'Hausse et guidon mécaniques' },
    reddot: { name: 'Point rouge', level: 1, desc: 'Visée dégagée, zoom ×1.35', mod: { zoom: 1.35 } },
    holo: { name: 'Holographique', level: 3, desc: 'Réticule large, visée rapide', mod: { zoom: 1.3, adsTimeMul: 0.92 } },
    acog: { name: 'Lunette ×3.5', level: 10, desc: 'Grossissement, visée plus lente', mod: { zoom: 2.6, adsTimeMul: 1.25, spreadAdsMul: 0.6 } },
  },
  muzzle: {
    none: { name: 'Aucun', level: 1, desc: '' },
    comp: { name: 'Compensateur', level: 2, desc: 'Recul vertical −15 %', mod: { recoilPitchMul: 0.85 } },
    flash: { name: 'Cache-flamme', level: 5, desc: 'Recul horizontal −25 %, flash réduit', mod: { recoilYawMul: 0.75, flash: 0.5 } },
    supp: { name: 'Silencieux', level: 12, desc: 'Invisible sur la minimap, portée −15 %', mod: { rangeMul: 0.85, suppressed: true } },
  },
  underbarrel: {
    none: { name: 'Aucun', level: 1, desc: '' },
    vgrip: { name: 'Poignée verticale', level: 6, desc: 'Recul −20 %', mod: { recoilPitchMul: 0.8, recoilYawMul: 0.85 } },
    agrip: { name: 'Poignée inclinée', level: 9, desc: 'Visée 15 % plus rapide', mod: { adsTimeMul: 0.85 } },
  },
  mag: {
    std: { name: 'Standard', level: 1, desc: '' },
    ext: { name: 'Chargeur grande capacité', level: 14, desc: '+50 % de munitions, rechargement plus lent', mod: { magMul: 1.5, reloadMul: 1.15, adsTimeMul: 1.05 } },
    fast: { name: 'Chargeur rapide', level: 18, desc: 'Rechargement −25 %', mod: { reloadMul: 0.75 } },
  },
};

/** Accessoires compatibles par arme. */
export const COMPAT = {
  ar: { optic: ['iron', 'reddot', 'holo', 'acog'], muzzle: ['none', 'comp', 'flash', 'supp'], underbarrel: ['none', 'vgrip', 'agrip'], mag: ['std', 'ext', 'fast'] },
  smg: { optic: ['iron', 'reddot', 'holo'], muzzle: ['none', 'comp', 'flash', 'supp'], underbarrel: ['none', 'vgrip', 'agrip'], mag: ['std', 'ext', 'fast'] },
  shotgun: { optic: ['iron', 'reddot', 'holo'], muzzle: ['none'], underbarrel: ['none'], mag: ['std', 'fast'] },
  dmr: { optic: ['iron', 'reddot', 'holo', 'acog'], muzzle: ['none', 'comp', 'flash', 'supp'], underbarrel: ['none', 'vgrip'], mag: ['std', 'ext', 'fast'] },
  sniper: { optic: ['iron'], muzzle: ['none', 'supp'], underbarrel: ['none'], mag: ['std', 'ext'] },
};

export const WEAPON_LEVELS = { ar: 1, smg: 1, shotgun: 4, dmr: 6, sniper: 8 };
const SUPP_SAMPLE = { ar: 'rifle_supp', dmr: 'rifle_supp', sniper: 'rifle_supp', smg: 'smg_supp', pistol: 'pistol_supp' };
export const SKINS = {
  black: { name: 'Noir', level: 1 },
  fde: { name: 'Sable (FDE)', level: 7 },
  od: { name: 'Vert olive', level: 11 },
  gray: { name: 'Gris urbain', level: 16 },
  gold: { name: 'Or', level: 40 },
};
export const OPERATOR_LEVELS = { ranger: 1, ghost: 1, desert: 5, arctic: 10, urban: 15, elite: 25 };
export const LETHALS ={ frag: { name: 'Grenade à fragmentation', level: 1 } };

export function defaultClasses() {
  return [
    { name: 'Assaut', primary: 'ar', att: { optic: 'reddot', muzzle: 'none', underbarrel: 'none', mag: 'std' }, skin: 'black', operator: 'ranger' },
    { name: 'Rapproché', primary: 'smg', att: { optic: 'reddot', muzzle: 'none', underbarrel: 'none', mag: 'std' }, skin: 'black', operator: 'ghost' },
    { name: 'Tireur', primary: 'dmr', att: { optic: 'iron', muzzle: 'none', underbarrel: 'none', mag: 'std' }, skin: 'black', operator: 'ranger' },
    { name: 'Brécheur', primary: 'shotgun', att: { optic: 'iron', muzzle: 'none', underbarrel: 'none', mag: 'std' }, skin: 'black', operator: 'ghost' },
    { name: 'Tireur d\'élite', primary: 'sniper', att: { optic: 'iron', muzzle: 'none', underbarrel: 'none', mag: 'std' }, skin: 'black', operator: 'ranger' },
  ];
}

/** Valide / corrige une classe (niveau, compatibilité). */
export function sanitizeClass(c, level = 99, operatorLevels = null) {
  const d = defaultClasses()[0];
  const out = { name: String(c?.name || d.name).replace(/[<>]/g, '').slice(0, 20) || d.name };
  out.primary = PRIMARIES.includes(c?.primary) && (WEAPON_LEVELS[c.primary] || 1) <= level ? c.primary : 'ar';
  out.att = {};
  for (const slot of Object.keys(SLOTS)) {
    const allowed = COMPAT[out.primary][slot];
    const want = c?.att?.[slot];
    out.att[slot] = allowed.includes(want) && ATTACHMENTS[slot][want].level <= level ? want : allowed[0];
  }
  out.skin = SKINS[c?.skin] && SKINS[c.skin].level <= level ? c.skin : 'black';
  const opOk = operatorLevels ? operatorLevels[c?.operator] !== undefined && operatorLevels[c.operator] <= level : typeof c?.operator === 'string';
  out.operator = opOk ? c.operator.slice(0, 20) : 'ranger';
  return out;
}

/** Statistiques effectives d'une arme équipée d'accessoires. */
export function effectiveStats(id, att = {}) {
  const base = WEAPON_STATS[id];
  const s = { ...base, sound: { ...base.sound } };
  let mods = [];
  for (const slot of Object.keys(SLOTS)) {
    const a = ATTACHMENTS[slot][att[slot]];
    if (a?.mod) mods.push(a.mod);
  }
  for (const m of mods) {
    if (m.zoom && id !== 'sniper') s.zoom = m.zoom;
    if (m.adsTimeMul) s.adsTime *= m.adsTimeMul;
    if (m.spreadAdsMul) s.spreadAds *= m.spreadAdsMul;
    if (m.recoilPitchMul) s.recoilPitch *= m.recoilPitchMul;
    if (m.recoilYawMul) s.recoilYaw *= m.recoilYawMul;
    if (m.rangeMul) s.range = [s.range[0] * m.rangeMul, s.range[1] * m.rangeMul];
    if (m.magMul) { s.mag = Math.round(s.mag * m.magMul); s.reserve = Math.round(s.reserve * m.magMul); }
    if (m.reloadMul) {
      if (s.reload) s.reload *= m.reloadMul;
      if (s.reloadEmpty) s.reloadEmpty *= m.reloadMul;
      if (s.reloadShell) s.reloadShell *= m.reloadMul;
    }
    if (m.suppressed) { s.suppressed = true; s.sound = { ...s.sound, freq: s.sound.freq * 0.55, low: s.sound.low * 0.35, crack: 0.15, tail: 0.25, sample: SUPP_SAMPLE[id] }; }
    if (m.flash) s.flashMul = m.flash;
  }
  if (!att.optic || att.optic === 'iron') s.zoom = id === 'sniper' ? base.zoom : Math.min(base.zoom, 1.25);
  return s;
}
