// Télécharge les assets CC0 de Poly Haven utilisés par le jeu dans public/assets/.
// Usage : node scripts/fetch-assets.mjs   (les fichiers déjà présents sont ignorés)
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/assets');
const UA = { 'User-Agent': 'strikepoint-fps-dev/0.1' };

export const TEXTURES = ['container_side', 'rusty_corrugated_iron', 'worn_asphalt', 'dirt', 'concrete_wall_008', 'red_brick_03', 'plastered_wall_02', 'rusty_metal_02', 'concrete_floor_worn_001'];
export const HDRI = 'industrial_sunset_02_puresky';
export const MODELS = ['bolt_action_rifle_7_62', 'service_pistol', 'overhead_crane', 'flood_lights', 'street_lamp_01', 'utility_box_01',
  'portable_generator', 'concrete_road_barrier', 'Barrel_01', 'wooden_crate_01', 'old_military_crate', 'old_tyre', 'covered_car',
  'fire_hydrant', 'metal_jerrycan', 'cardboard_box_01', 'trashbag', 'ammo_box',
  // environnement
  'shrub_01', 'shrub_02', 'shrub_04', 'grass_medium_01', 'grass_bermuda_01', 'boulder_01', 'rock_07', 'dead_tree_trunk', 'tree_stump_01',
  'modular_factory_facade', 'modular_urban_apartments_facade', 'modular_chainlink_fence', 'modular_industrial_pipes_01',
  'modular_airduct_rectangular_01', 'exterior_aircon_unit', 'security_light', 'rollershutter_door', 'power_box_01', 'modular_fire_escape',
  'metal_trash_can', 'plastic_crate_01', 'industrial_pastic_container', 'propane_tank', 'concrete_road_barrier_02', 'cement_bag',
  'wooden_military_crate', 'modular_electricity_poles', 'street_lamp_02', 'water_manhole_cover'];

async function json(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return 0;
  const u = new URL(url);
  if (!u.hostname.endsWith('polyhaven.org') && !u.hostname.endsWith('polyhaven.com')) throw new Error(`Hôte inattendu : ${u.hostname}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

const safe = (p) => {
  const n = path.normalize(p);
  if (n.startsWith('..') || path.isAbsolute(n)) throw new Error(`Chemin suspect : ${p}`);
  return n;
};

let total = 0;
const credits = [];
const log = (s) => process.stdout.write(s + '\n');

for (const id of TEXTURES) {
  const f = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [map, name] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
    total += await download(f[map]['2k'].jpg.url, path.join(OUT, 'textures', id, `${name}.jpg`));
  }
  credits.push(id);
  log(`texture  ${id}`);
}

{
  const f = await json(`https://api.polyhaven.com/files/${HDRI}`);
  total += await download(f.hdri['4k'].hdr.url, path.join(OUT, 'hdri', `${HDRI}.hdr`));
  credits.push(HDRI);
  log(`hdri     ${HDRI}`);
}

for (const id of MODELS) {
  const f = await json(`https://api.polyhaven.com/files/${id}`);
  const g = f.gltf['1k'].gltf;
  const dir = path.join(OUT, 'models', id);
  total += await download(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include || {})) total += await download(inc.url, path.join(dir, safe(rel)));
  credits.push(id);
  log(`modèle   ${id}`);
}

fs.writeFileSync(path.join(OUT, 'CREDITS.md'),
  `# Crédits\n\n## Poly Haven (CC0)\n\n${credits.map((c) => `- ${c} — https://polyhaven.com/a/${c}`).join('\n')}\n\n` +
  '## Armes et sons — « Free Classic Weapons Pack » par Stein Games (CC0)\n\nhttps://stein-indie.itch.io/classic-weapons-pack (AK-47, MP5, M700, 1911, M14 + sons). Préparés avec scripts/prepare-weapons.ps1.\n\n' +
  '## Personnage\n\n- Soldier.glb — exemples officiels three.js (https://github.com/mrdoob/three.js), modèle et animations Mixamo\n');
log(`Terminé : ${(total / 1048576).toFixed(1)} Mo téléchargés`);
