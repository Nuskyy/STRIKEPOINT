// Statistiques des armes, partagées entre le client et le serveur multijoueur.
export const WEAPON_STATS = {
  ar: {
    name: 'AK-47', cls: "Fusil d'assaut", mode: 'auto', rpm: 720,
    damage: 30, minDamage: 22, range: [28, 60], headMult: 1.6, pellets: 1,
    mag: 30, reserve: 210, reload: 2.0, reloadEmpty: 2.5,
    zoom: 1.35, adsTime: 0.22, moveMult: 0.96,
    spreadHip: 0.032, spreadAds: 0.0015, spreadMove: 0.028,
    recoilPitch: 0.0105, recoilYaw: 0.0055, recoilBias: 0.3, bloom: 0.004,
    sound: { freq: 1400, decay: 0.14, low: 0.9, crack: 1, tail: 0.6, sample: 'ar' },
  },
  smg: {
    name: 'MP5', cls: 'Pistolet-mitrailleur', mode: 'auto', rpm: 900,
    damage: 24, minDamage: 15, range: [12, 30], headMult: 1.5, pellets: 1,
    mag: 32, reserve: 224, reload: 1.7, reloadEmpty: 2.1,
    zoom: 1.2, adsTime: 0.16, moveMult: 1.06,
    spreadHip: 0.026, spreadAds: 0.004, spreadMove: 0.016,
    recoilPitch: 0.008, recoilYaw: 0.0075, recoilBias: -0.2, bloom: 0.003,
    sound: { freq: 1900, decay: 0.09, low: 0.55, crack: 0.8, tail: 0.4, sample: 'smg' },
  },
  shotgun: {
    name: 'Brecher SG-12', cls: 'Fusil à pompe', mode: 'pump', rpm: 72,
    damage: 17, minDamage: 4, range: [7, 22], headMult: 1.25, pellets: 10, pelletSpread: 0.06,
    mag: 7, reserve: 42, reloadStart: 0.35, reloadShell: 0.42,
    zoom: 1.1, adsTime: 0.2, moveMult: 1.0,
    spreadHip: 0.02, spreadAds: 0.008, spreadMove: 0.01,
    recoilPitch: 0.055, recoilYaw: 0.01, recoilBias: 0, bloom: 0,
    sound: { freq: 900, decay: 0.25, low: 1.4, crack: 1.2, tail: 1.0 },
  },
  sniper: {
    name: 'M700', cls: 'Fusil de précision', mode: 'bolt', rpm: 46,
    damage: 105, minDamage: 95, range: [80, 200], headMult: 2.5, pellets: 1,
    mag: 5, reserve: 30, reload: 2.6, reloadEmpty: 3.0,
    zoom: 4.5, adsTime: 0.34, moveMult: 0.92, scope: true,
    spreadHip: 0.07, spreadAds: 0.0, spreadMove: 0.06,
    recoilPitch: 0.06, recoilYaw: 0.008, recoilBias: 0, bloom: 0,
    sound: { freq: 1100, decay: 0.32, low: 1.6, crack: 1.4, tail: 1.4, sample: 'sniper' },
  },
  dmr: {
    name: 'M14 Marksman', cls: 'Fusil de tireur', mode: 'semi', rpm: 330,
    damage: 49, minDamage: 40, range: [45, 100], headMult: 2.0, pellets: 1,
    mag: 20, reserve: 120, reload: 2.3, reloadEmpty: 2.8,
    zoom: 1.5, adsTime: 0.27, moveMult: 0.93,
    spreadHip: 0.04, spreadAds: 0.0008, spreadMove: 0.035,
    recoilPitch: 0.024, recoilYaw: 0.006, recoilBias: 0.2, bloom: 0.006,
    sound: { freq: 1250, decay: 0.2, low: 1.2, crack: 1.2, tail: 1.0, sample: 'dmr' },
  },
  pistol: {
    name: 'M1911', cls: 'Pistolet', mode: 'semi', rpm: 420,
    damage: 28, minDamage: 18, range: [12, 30], headMult: 1.5, pellets: 1,
    mag: 8, reserve: 64, reload: 1.4, reloadEmpty: 1.7,
    zoom: 1.15, adsTime: 0.14, moveMult: 1.08,
    spreadHip: 0.02, spreadAds: 0.004, spreadMove: 0.012,
    recoilPitch: 0.018, recoilYaw: 0.006, recoilBias: 0, bloom: 0.006,
    sound: { freq: 1700, decay: 0.1, low: 0.6, crack: 0.9, tail: 0.4, sample: 'pistol' },
  },
};

export const PRIMARIES = ['ar', 'smg', 'shotgun', 'dmr', 'sniper'];

export function damageAt(stats, dist) {
  const [r0, r1] = stats.range;
  if (dist <= r0) return stats.damage;
  if (dist >= r1) return stats.minDamage;
  const k = (dist - r0) / (r1 - r0);
  return stats.damage + (stats.minDamage - stats.damage) * k;
}

export const MELEE_DAMAGE = 150;
export const GRENADE_DAMAGE = 170;
export const MAX_HIT = 300;
