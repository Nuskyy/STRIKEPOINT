// Carte "Zone Delta" : géométrie en boîtes (collisions exactes) + rendu fusionné par matériau.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures } from './textures.js';

export const HALF = 70;

const MAT_DEFS = {
  concrete: { tex: 'concrete', tile: 4, color: 0xffffff, rough: 0.95 },
  concrete_dark: { tex: 'concrete', tile: 4, color: 0x8c8c8c, rough: 0.95 },
  brick: { tex: 'brick', tile: 2.4, color: 0xffffff, rough: 0.9 },
  plaster: { tex: 'plaster', tile: 3, color: 0xffffff, rough: 0.95 },
  plaster_blue: { tex: 'plaster', tile: 3, color: 0xa7c1cc, rough: 0.95 },
  metal: { tex: 'metal', tile: 3, color: 0x9aa3a8, rough: 0.6, metal: 0.4 },
  metal_dark: { tex: 'metal', tile: 3, color: 0x5b6266, rough: 0.6, metal: 0.4 },
  c_red: { tex: 'metal', tile: 2.6, color: 0xa13a28, rough: 0.55, metal: 0.35 },
  c_blue: { tex: 'metal', tile: 2.6, color: 0x2f5d8a, rough: 0.55, metal: 0.35 },
  c_green: { tex: 'metal', tile: 2.6, color: 0x3f6e3f, rough: 0.55, metal: 0.35 },
  c_orange: { tex: 'metal', tile: 2.6, color: 0xc06a22, rough: 0.55, metal: 0.35 },
  c_gray: { tex: 'metal', tile: 2.6, color: 0x7b8085, rough: 0.55, metal: 0.35 },
  c_yellow: { tex: 'metal', tile: 2.6, color: 0xb89a2a, rough: 0.55, metal: 0.35 },
  wood: { tex: 'wood', tile: 1.2, color: 0xffffff, rough: 0.85, box: true },
  sandbag: { tex: 'sandbag', tile: 1.4, color: 0xffffff, rough: 1 },
  roof: { tex: 'asphalt', tile: 4, color: 0x9a9a9a, rough: 0.95 },
  floor: { tex: 'tiles', tile: 2.4, color: 0xffffff, rough: 0.8 },
  car_red: { tex: 'paint', tile: 4, color: 0x8c2a22, rough: 0.35, metal: 0.55 },
  car_blue: { tex: 'paint', tile: 4, color: 0x27466e, rough: 0.35, metal: 0.55 },
  car_white: { tex: 'paint', tile: 4, color: 0xc9c9c4, rough: 0.35, metal: 0.55 },
  car_gray: { tex: 'paint', tile: 4, color: 0x55585c, rough: 0.35, metal: 0.55 },
  tire: { tex: 'asphalt', tile: 1, color: 0x333333, rough: 0.9 },
  glass: { tex: 'paint', tile: 4, color: 0x1a2630, rough: 0.1, metal: 0.8 },
  ammo: { tex: 'ammo', tile: 1, color: 0xffffff, rough: 0.7, box: true },
};

// Textures photo Poly Haven (prioritaires si chargées) : id, taille de répétition (m), teinte.
const PH = {
  concrete: ['concrete_wall_008', 3],
  concrete_dark: ['concrete_wall_008', 3, 0x8a857c],
  brick: ['red_brick_03', 2.2],
  plaster: ['plastered_wall_02', 3],
  plaster_blue: ['plastered_wall_02', 3, 0xa9c4cf],
  metal: ['rusty_corrugated_iron', 3],
  metal_dark: ['rusty_metal_02', 2.5],
  roof: ['rusty_metal_02', 3, 0xb0aca5],
  floor: ['concrete_floor_worn_001', 3],
  c_red: ['container_side', 2.6, 0x8e2a1c, true],
  c_blue: ['container_side', 2.6, 0x1f4a78, true],
  c_green: ['container_side', 2.6, 0x2e5a34, true],
  c_orange: ['container_side', 2.6, 0xb0561a, true],
  c_gray: ['container_side', 2.6, 0x70757a, true],
  c_yellow: ['container_side', 2.6, 0xa88a1e, true],
};

/** Remplace la couleur de la texture par sa luminance × teinte (recolore la texture de conteneur verte). */
function recolor(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float lumi = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        diffuseColor.rgb *= clamp( lumi / 0.2, 0.0, 2.0 );
      #endif`);
  };
  mat.customProgramCacheKey = () => 'recolor';
}

const MINIMAP_COLORS = {
  concrete: '#8d8d88', concrete_dark: '#6e6e6a', brick: '#8e5040', plaster: '#b9b0a0', plaster_blue: '#90a8b2',
  metal: '#7d868a', metal_dark: '#585e62', wood: '#8a6a40', sandbag: '#9a8c66', roof: '#5a5a5c', floor: '#777',
  ammo: '#6f8a3a', tire: '#333', glass: '#334',
};

export class GameMap {
  constructor(scene, assets = null) {
    this.scene = scene;
    this.assets = assets;
    this.boxes = [];
    this.ammoCrates = [];
    this.roads = [];
    this.trees = [];
    this.windows = [];
    this.props = [];
    this.models = [];
    this.fences = [];
    this.layout();
    if (assets?.ok) this.layoutModels();
  }

  /**
   * Place un modèle glTF (échelle réelle). rot en quarts de tour. collide : boîte de collision
   * calculée à partir de la boîte englobante du modèle.
   */
  model(id, x, z, rot = 0, { y = 0, collide = true, rx = 0, scale = 1, minH = 0.25, single = false } = {}) {
    const s = this.assets?.sizes[id];
    if (!s) return;
    this.models.push({ id, x, y, z, rot: (rot * Math.PI) / 2, rx, scale, single });
    if (!collide || rx) return;
    const h = s.size.y * scale;
    if (h < minH) return;
    const a = (rot * Math.PI) / 2, c = Math.round(Math.cos(a)), sn = Math.round(Math.sin(a));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const px of [s.min.x, s.max.x]) for (const pz of [s.min.z, s.max.z]) {
      const X = (px * c + pz * sn) * scale, Z = (-px * sn + pz * c) * scale;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    }
    const b = { min: { x: x + x0, y: y + Math.max(0, s.min.y * scale), z: z + z0 }, max: { x: x + x1, y: y + s.max.y * scale, z: z + z1 }, mat: 'metal_dark', hidden: true, prop: true };
    this.boxes.push(b);
  }

  layoutModels() {
    // sacs de sable et caisses : rendus en détail par props.js (la boîte reste pour les collisions)
    this.sandbagBoxes = this.boxes.filter((b) => b.mat === 'sandbag');
    this.crateBoxes = this.boxes.filter((b) => b.mat === 'wood');
    for (const b of [...this.sandbagBoxes, ...this.crateBoxes]) b.hidden = true;
    // Barrières béton (2 éléments par barrière de 3 m)
    for (const b of this.barriers) {
      b.box.hidden = true;
      for (const o of [-0.76, 0.76]) this.model('concrete_road_barrier', b.x + (b.alongX ? o : 0), b.z + (b.alongX ? 0 : o), b.alongX ? 0 : 1, { collide: false });
    }
    // Lampadaires côté opposé aux poteaux
    for (const x of [-63, -45, -27, 27, 45, 63]) this.model('street_lamp_01', x, 5.6, 2);
    for (const z of [-63, -45, -27, 27, 45, 63]) this.model('street_lamp_01', -5.6, z, 1);
    // Projecteurs + groupes électrogènes dans les parcs à conteneurs
    this.model('flood_lights', 36, 47.5, 0);
    this.model('portable_generator', 39.5, 47, 1);
    this.model('flood_lights', -40, -52, 2);
    this.model('portable_generator', -36.5, -52.5, 0);
    this.model('flood_lights', 50, -52, 1);
    // Pont roulant suspendu sous le toit de l'entrepôt
    this.model('overhead_crane', -38, -37, 0, { y: 6.85 - this.assets.sizes.overhead_crane.max.y, collide: false });
    // Armoires électriques au pied des poteaux
    for (const [x, z] of [[-36, -6.4], [18, -6.4], [6.4, 36], [6.4, -18]]) this.model('utility_box_01', x, z, 0);
    // Bornes incendie
    for (const [x, z] of [[-12, 5.4], [12, -5.4], [-5.4, -12], [5.4, 12]]) this.model('fire_hydrant', x, z, 0, { collide: false, single: true });
    // Voitures bâchées
    this.model('covered_car', 20, -46, 0);
    this.model('covered_car', -44, 40, 1);
    // Caisses militaires / bois, cartons, sacs, jerrycans (décor près des bâtiments)
    const decor = [
      ['old_military_crate', -44, -31, 0], ['old_military_crate', -32, -42, 1], ['wooden_crate_01', -46, -33, 0], ['wooden_crate_01', -29, -38, 1],
      ['old_military_crate', 31, -25, 0], ['cardboard_box_01', 28, -38.8, 0], ['cardboard_box_01', 28.5, -39.3, 1], ['cardboard_box_01', 38, -38, 0],
      ['trashbag', -33.2, 24, 0], ['trashbag', -32.8, 24.7, 1], ['trashbag', 44.6, 30, 0], ['trashbag', -17, 31, 0],
      ['metal_jerrycan', -19, 19.6, 0], ['metal_jerrycan', -18.6, 19.7, 1], ['metal_jerrycan', 39, 46.5, 0],
      ['wooden_crate_01', 15, 46.5, 0], ['cardboard_box_01', -21, 37.4, 0], ['old_military_crate', -56, 46, 1], ['wooden_crate_01', 58, -44, 0],
    ];
    for (const [id, x, z, r] of decor) this.model(id, x, z, r);
    // Mobilier urbain et industriel
    const urban = [
      ['metal_trash_can', -32.6, 28, 1], ['metal_trash_can', 45.2, 33, 1],
      ['plastic_crate_01', -21.6, 26.6, 0], ['plastic_crate_01', -21.2, 26.9, 1], ['plastic_crate_01', -21.4, 26.75, 0, { y: 0.26, collide: false }],
      ['propane_tank', -15.3, 32.4, 0], ['propane_tank', -15.3, 33.1, 0], ['propane_tank', -15.35, 33.8, 0],
      ['industrial_pastic_container', 34.5, -25.8, 0], ['industrial_pastic_container', 35.2, -25.8, 1],
      ['cement_bag', 14, -31, 0], ['cement_bag', 14.5, -31.2, 1], ['cement_bag', 14.2, -31.1, 0, { y: 0.18, collide: false }],
      ['wooden_military_crate', -55, -47, 0], ['wooden_military_crate', 50, 40, 1], ['wooden_military_crate', -55, -47.6, 0, { y: 0.46, collide: false }],
      ['concrete_road_barrier_02', -10, 60, 0], ['concrete_road_barrier_02', 10, -60, 0], ['concrete_road_barrier_02', -60.5, 24, 1],
    ];
    for (const [id, x, z, r, o] of urban) this.model(id, x, z, r, o || {});
    for (const [x, z] of [[12, 1], [-30, -1.5], [1.5, -30], [-1.5, 45], [40, 1.2]]) this.model('water_manhole_cover', x, z, 0, { collide: false, y: 0.012 });
    // Équipements muraux (climatiseurs, projecteurs)
    this.model('exterior_aircon_unit', -43, 24.58, 2, { y: 2.3, collide: false });
    this.model('exterior_aircon_unit', 40.5, 28.58, 2, { y: 2.3, collide: false });
    this.model('exterior_aircon_unit', 26.58, -36, 3, { y: 2.6, collide: false });
    this.model('security_light', -41.5, -27.77, 0, { y: 5.4, collide: false });
    this.model('security_light', -34.5, -27.77, 0, { y: 5.4, collide: false });
    this.model('security_light', 30, -27.77, 0, { y: 3.6, collide: false });
    this.model('rollershutter_door', -49.25, -42, 3, { collide: false });
    this.model('rollershutter_door', -49.25, -30.5, 3, { collide: false });
    this.model('modular_industrial_pipes_01', -31, -44.35, 2, { y: 1.2, collide: false });
    // Grillages (collision fine + rendu dans scenery.js)
    for (const [x0, z0, x1, z1] of [[16, 43.5, 30, 43.5], [-62, -49.5, -50, -49.5], [60.5, 25, 60.5, 38]]) {
      this.fences.push({ x0, z0, x1, z1 });
      const alongX = z0 === z1;
      this.box((x0 + x1) / 2, 0, (z0 + z1) / 2, alongX ? Math.abs(x1 - x0) : 0.1, 2.4, alongX ? 0.1 : Math.abs(z1 - z0), 'metal_dark').hidden = true;
    }

    // Munitions posées sur les caisses de ravitaillement
    for (const c of this.ammoCrates) {
      this.model('ammo_box', c.x - 0.3, c.z, 1, { y: 0.8, collide: false });
      this.model('ammo_box', c.x + 0.25, c.z + 0.05, 1, { y: 0.8, collide: false });
    }
  }

  box(cx, y0, cz, w, h, d, mat) {
    const b = { min: { x: cx - w / 2, y: y0, z: cz - d / 2 }, max: { x: cx + w / 2, y: y0 + h, z: cz + d / 2 }, mat };
    this.boxes.push(b);
    return b;
  }

  /** Mur aligné sur un axe, avec ouvertures (portes / fenêtres). at = distance depuis le début du mur. */
  wall(ax, az, bx, bz, { h = 3, t = 0.3, mat = 'concrete', openings = [], y0 = 0 } = {}) {
    const alongX = Math.abs(bz - az) < 1e-6;
    const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const fixed = alongX ? az : ax;
    const ops = openings
      .map((o) => ({ a: start + o.at - o.w / 2, b: start + o.at + o.w / 2, bottom: o.bottom ?? 0, top: Math.min(h, o.top ?? 2.3) }))
      .sort((p, q) => p.a - q.a);
    for (const o of ops) {
      if (o.bottom > 0.5 && o.top < h) this.windows.push({ alongX, fixed, a: o.a, b: o.b, y0: y0 + o.bottom, y1: y0 + o.top, broken: Math.random() < 0.35 });
    }
    const seg = (s0, s1, ya, yb) => {
      if (s1 - s0 < 0.01 || yb - ya < 0.01) return;
      const c = (s0 + s1) / 2, len = s1 - s0;
      if (alongX) this.box(c, y0 + ya, fixed, len, yb - ya, t, mat);
      else this.box(fixed, y0 + ya, c, t, yb - ya, len, mat);
    };
    let cur = start;
    for (const o of ops) {
      seg(cur, o.a, 0, h);
      seg(o.a, o.b, 0, o.bottom);
      seg(o.a, o.b, o.top, h);
      cur = o.b;
    }
    seg(cur, end, 0, h);
  }

  /**
   * Bâtiment rectangulaire. Les ouvertures sont données par côté (n: -z, s: +z, w: -x, e: +x)
   * avec `at` relatif au centre du côté. win:true => fenêtre (1.0 → 2.1 m).
   */
  building(cx, cz, w, d, h, mat, sides = {}, opts = {}) {
    const t = opts.t ?? 0.4;
    const conv = (list, len) => (list || []).map((o) => ({
      at: len / 2 + o.at, w: o.w ?? 1.4,
      bottom: o.win ? 1.0 : (o.bottom ?? 0), top: o.win ? 2.1 : (o.top ?? 2.3),
    }));
    const wl = w + t, dl = d - t;
    this.wall(cx - wl / 2, cz - d / 2, cx + wl / 2, cz - d / 2, { h, t, mat, openings: conv(sides.n, wl) });
    this.wall(cx - wl / 2, cz + d / 2, cx + wl / 2, cz + d / 2, { h, t, mat, openings: conv(sides.s, wl) });
    this.wall(cx - w / 2, cz - dl / 2, cx - w / 2, cz + dl / 2, { h, t, mat, openings: conv(sides.w, dl) });
    this.wall(cx + w / 2, cz - dl / 2, cx + w / 2, cz + dl / 2, { h, t, mat, openings: conv(sides.e, dl) });
    this.box(cx, h, cz, w + t, 0.3, d + t, opts.roof || 'roof');
    this.box(cx, 0, cz, w - t, 0.04, d - t, opts.floor || 'floor');
  }

  container(x, z, alongX, mat, y0 = 0) {
    const L = 6.1, W = 2.44, H = 2.6;
    this.box(x, y0, z, alongX ? L : W, H, alongX ? W : L, mat);
    (this.containers ||= []).push({ x, z, y0, alongX, mat, L, W, H });
  }

  crateStack(x, z, n = 1, s = 1.2) {
    for (let i = 0; i < n; i++) this.box(x + (i % 2) * 0.05, i * s, z, s, s, s, 'wood');
  }

  barrier(x, z, alongX) {
    const b = this.box(x, 0, z, alongX ? 3 : 0.6, 0.85, alongX ? 0.6 : 3, 'concrete');
    (this.barriers ||= []).push({ x, z, alongX, box: b });
  }

  car(x, z, alongX, mat) {
    // collisions seulement ; le rendu (carrosserie arrondie) est fait dans scenery.js
    const L = 4.3, W = 1.85;
    this.box(x, 0, z, alongX ? L : W, 1.05, alongX ? W : L, mat).hidden = true;
    this.box(x + (alongX ? -0.2 : 0), 1.05, z + (alongX ? 0 : -0.2), alongX ? 2.3 : 1.62, 0.52, alongX ? 1.62 : 2.3, 'glass').hidden = true;
    this.props.push({ type: 'car', x, z, alongX, mat, rot: 0, tint: Math.random() });
    this.minimapExtra = this.minimapExtra || [];
    this.minimapExtra.push({ x, z, w: alongX ? L : W, d: alongX ? W : L });
  }

  ammoCrate(x, z) {
    this.box(x, 0, z, 1.4, 0.8, 0.9, 'ammo');
    this.ammoCrates.push({ x, z, cooldown: 0 });
  }

  tree(x, z) {
    this.trees.push({ x, z, s: 0.8 + Math.random() * 0.5 });
    this.box(x, 0, z, 0.5, 4, 0.5, null);
  }

  layout() {
    const H = HALF;
    // Enceinte
    this.box(0, 0, -H - 0.5, 2 * H + 2, 4.2, 1, 'concrete_dark');
    this.box(0, 0, H + 0.5, 2 * H + 2, 4.2, 1, 'concrete_dark');
    this.box(-H - 0.5, 0, 0, 1, 4.2, 2 * H, 'concrete_dark');
    this.box(H + 0.5, 0, 0, 1, 4.2, 2 * H, 'concrete_dark');

    this.roads.push({ x: 0, z: 0, w: 2 * H, d: 8 }, { x: 0, z: 0, w: 8, d: 2 * H });

    // Place centrale
    this.box(0, 0, 0, 4, 0.9, 4, 'concrete');
    this.box(0, 0.9, 0, 1.2, 3.2, 1.2, 'concrete_dark');
    this.box(-8, 0, 0, 0.8, 1.05, 4.5, 'sandbag');
    this.box(8, 0, 0, 0.8, 1.05, 4.5, 'sandbag');
    this.box(0, 0, -8, 4.5, 1.05, 0.8, 'sandbag');
    this.box(0, 0, 8, 4.5, 1.05, 0.8, 'sandbag');

    // Véhicules
    this.car(-15, 2.5, true, 'car_red');
    this.car(16, -2.5, true, 'car_blue');
    this.car(2.5, 20, false, 'car_white');
    this.car(-2.5, -21, false, 'car_gray');
    this.car(-46, -6, true, 'car_gray');
    this.car(47, 6, true, 'car_white');

    // --- Quadrant SO : entrepôt ---
    this.building(-38, -36, 22, 16, 7, 'metal',
      { s: [{ at: 0, w: 6, top: 5 }], e: [{ at: 3, w: 1.6 }], n: [{ at: -6, w: 1.6 }], w: [{ at: 2, w: 1.6 }] },
      { roof: 'metal_dark', floor: 'concrete_dark' });
    this.crateStack(-45, -40, 2); this.crateStack(-43.8, -40, 1);
    this.crateStack(-30, -32, 2); this.crateStack(-31.2, -32, 1);
    this.container(-37, -41.5, true, 'c_gray');
    this.box(-38, 0, -33, 6, 1.0, 1.2, 'metal_dark');
    // Abri
    this.building(-14, -52, 6, 6, 3, 'metal_dark', { n: [{ at: 0, w: 1.6 }], e: [{ at: 0, w: 1.4, win: true }] });
    // Conteneurs SO
    this.container(-58, -58, true, 'c_red');
    this.container(-58, -58, true, 'c_blue', 2.6);
    this.container(-46, -62, true, 'c_green');
    this.container(-34, -58, false, 'c_orange');
    this.container(-26, -63, true, 'c_gray');

    // --- Quadrant NO : maison, station-service ---
    this.building(-40, 30, 12, 10, 3.6, 'plaster',
      { s: [{ at: -3 }, { at: 3, win: true, w: 1.6 }], e: [{ at: 2 }], n: [{ at: -3, win: true, w: 1.6 }, { at: 3, win: true, w: 1.6 }], w: [{ at: 0, win: true, w: 1.6 }] });
    this.wall(-38, 25.2, -38, 34.8, { h: 3.6, t: 0.15, mat: 'plaster', openings: [{ at: 4.8, w: 1.2 }] });
    // Station-service
    for (const [px, pz] of [[-25, 19], [-15, 19], [-25, 25], [-15, 25]]) this.box(px, 0, pz, 0.4, 4, 0.4, 'concrete');
    this.box(-20, 4, 22, 12, 0.4, 8, 'metal');
    this.box(-20, 0, 20.5, 0.8, 1.4, 0.5, 'metal_dark');
    this.box(-20, 0, 23.5, 0.8, 1.4, 0.5, 'metal_dark');
    this.building(-20, 34, 8, 5, 3, 'plaster_blue', { s: [{ at: -1.5 }, { at: 2, win: true, w: 2 }], e: [{ at: 0, win: true }] });
    // Mur en ruine
    this.wall(-26, 45, -17, 45, { h: 2.6, t: 0.4, mat: 'brick', openings: [{ at: 3, w: 1.4, bottom: 1.0, top: 2.0 }] });
    this.box(-14, 0, 46, 2, 0.9, 1.4, 'brick');
    // Conteneurs NO
    this.container(-56, 50, false, 'c_blue');
    this.container(-49, 60, true, 'c_yellow');
    this.container(-49, 60, true, 'c_red', 2.6);

    // --- Quadrant SE : bureaux avec accès au toit ---
    this.building(34, -34, 14, 12, 4.2, 'concrete',
      { w: [{ at: 2 }, { at: -3, win: true }], s: [{ at: -4 }, { at: 2, win: true }, { at: 5, win: true }],
        n: [{ at: -4, win: true }, { at: 0, win: true }, { at: 4, win: true }], e: [{ at: -3, win: true }] });
    // bureaux intérieurs
    this.box(30, 0, -37, 2, 0.75, 1, 'wood');
    this.box(37, 0, -31, 2, 0.75, 1, 'wood');
    this.wall(34, -39.8, 34, -34, { h: 4.2, t: 0.15, mat: 'plaster' });
    // escalier extérieur (côté est) jusqu'au toit (4.5 m)
    for (let i = 0; i < 15; i++) this.box(42.1, 0, -27.5 - i * 0.45, 1.6, (i + 1) * 0.3, 0.45, 'concrete_dark');
    this.box(42.1, 0, -34.75, 1.6, 4.5, 1.5, 'concrete_dark');
    // parapet du toit
    const py = 4.5;
    this.wall(26.8, -40.2, 41.2, -40.2, { h: 1, t: 0.3, mat: 'concrete', y0: py });
    this.wall(26.8, -27.8, 41.2, -27.8, { h: 1, t: 0.3, mat: 'concrete', y0: py });
    this.wall(26.95, -40.05, 26.95, -27.95, { h: 1, t: 0.3, mat: 'concrete', y0: py });
    this.wall(41.05, -40.05, 41.05, -27.95, { h: 1, t: 0.3, mat: 'concrete', y0: py, openings: [{ at: 5.3, w: 2.6, bottom: 0, top: 1 }] });
    // ruine
    this.wall(18, -21, 18, -14, { h: 2.2, t: 0.4, mat: 'brick', openings: [{ at: 3.5, w: 1.3, bottom: 0.9, top: 1.8 }] });
    // Conteneurs SE
    this.container(56, -58, true, 'c_orange');
    this.container(48, -64, true, 'c_blue');
    this.container(62, -50, false, 'c_green');
    this.container(40, -60, false, 'c_red');

    // --- Quadrant NE : maison, parc à conteneurs ---
    this.building(38, 34, 12, 10, 3.6, 'brick',
      { n: [{ at: 3 }, { at: -3, win: true, w: 1.6 }], w: [{ at: -2 }], s: [{ at: -3, win: true, w: 1.6 }, { at: 3, win: true, w: 1.6 }], e: [{ at: 0, win: true, w: 1.6 }] });
    this.wall(32.2, 34, 37, 34, { h: 3.6, t: 0.15, mat: 'plaster', openings: [{ at: 2.5, w: 1.2 }] });
    this.container(24, 58, true, 'c_blue');
    this.container(24, 58, true, 'c_orange', 2.6);
    this.container(34, 55, false, 'c_red');
    this.container(46, 60, true, 'c_green');
    this.container(46, 52, true, 'c_gray');
    this.container(56, 46, false, 'c_blue');
    this.building(14, 50, 6, 6, 3, 'metal', { s: [{ at: 0, w: 1.6 }], w: [{ at: 0, win: true }] });

    // Barrières béton
    this.barrier(-30, -6, true); this.barrier(30, 6, true);
    this.barrier(-6, -32, false); this.barrier(6, 32, false);
    this.barrier(-52, -14, false); this.barrier(52, 14, false);
    this.barrier(-24, 6, true); this.barrier(24, -6, true);
    this.barrier(0, -40, true); this.barrier(0, 40, true);

    // Caisses
    const crates = [[-52, 10, 2], [-50.8, 10, 1], [-52, -22, 1], [52, -10, 2], [53.2, -10, 1], [52, 22, 1], [-28, -18, 2],
      [-26.8, -18.6, 1], [27, 18, 2], [25.8, 18.4, 1], [-10, -38, 1], [10, 38, 1], [-6, 50, 2], [6, -50, 2], [-60, 30, 1],
      [60, -30, 1], [12, -30, 1], [-12, 30, 1]];
    for (const [x, z, n] of crates) this.crateStack(x, z, n);

    // Caisses de munitions
    this.ammoCrate(-46, -20);
    this.ammoCrate(44, 20);
    this.ammoCrate(-6, 16);

    // Arbres
    if (!this.assets?.ok) for (const [x, z] of [[-63, 38], [-64, -40], [63, -38], [64, 40], [-32, 62], [32, -62], [-8, -63], [8, 63]]) this.tree(x, z);

    // Poteaux électriques le long des routes
    for (const x of [-54, -36, -18, 18, 36, 54]) this.prop('pole', x, -5.5, { axis: 'x' });
    for (const z of [-54, -36, -18, 18, 36, 54]) this.prop('pole', 5.5, z, { axis: 'z' });
    // Fûts
    for (const [x, z] of [[-50, -26], [-49.2, -26.5], [-50.2, -25.1], [30, -22], [31, -22.5], [30.4, -21.2], [-34, 44], [-33.1, 44.4],
      [44, 46], [-10, -58], [-9.2, -58.4], [56, 28], [-36, 8], [12, 44.5], [-58, 44]]) this.prop('barrel', x, z);
    // Palettes et pneus
    for (const [x, z] of [[-22, -26], [26, 26], [-44, 16], [46, -16], [-4, -46]]) this.box(x, 0, z, 1.2, 0.14, 1.0, 'wood');
    for (const [x, z] of [[-22, -28.5], [27.5, 27.5], [-30, 54]]) this.prop('tires', x, z);
  }

  prop(type, x, z, opts = {}) {
    this.props.push({ type, x, z, ...opts, rot: Math.random() * Math.PI * 2, tint: Math.random() });
    if (type === 'pole') this.box(x, 0, z, 0.3, 8, 0.3, null);
    else if (type === 'barrel') this.box(x, 0, z, 0.6, 0.9, 0.6, null);
    else if (type === 'tires') this.box(x, 0, z, 1.1, 0.95, 1.1, null);
  }

  buildMeshes() {
    const tex = getTextures();
    this.wetMaterials = [];
    const groups = new Map();
    for (const b of this.boxes) {
      if (!b.mat || b.hidden) continue;
      if (!groups.has(b.mat)) groups.set(b.mat, []);
      groups.get(b.mat).push(b);
    }
    const root = new THREE.Group();
    const A = this.assets?.ok ? this.assets : null;
    for (const [mat, list] of groups) {
      let def = MAT_DEFS[mat];
      const ph = A && PH[mat];
      let material = ph ? A.material(ph[0], { color: ph[2] ?? 0xffffff }) : null;
      if (material) {
        def = { ...def, tile: ph[1], box: false };
        if (ph[3]) recolor(material);
      }
      const geos = list.map((b) => boxGeo(b, def));
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          map: tex[def.tex], color: def.color, roughness: 1, metalness: def.metal || 0,
          normalMap: tex[def.tex + '_n'], normalScale: new THREE.Vector2(1, 1),
          roughnessMap: def.tex === 'paint' ? null : tex[def.tex + '_r'],
        });
        if (def.tex === 'paint') material.roughness = def.rough;
      }
      if (mat === 'glass') { material.transparent = true; material.opacity = 0.55; material.envMapIntensity = 2.5; }
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh);
    }
    // Routes
    const roadMat = (A && A.material('worn_asphalt')) ||
      new THREE.MeshStandardMaterial({ map: tex.asphalt, normalMap: tex.asphalt_n, roughnessMap: tex.asphalt_r, roughness: 1 });
    Object.assign(roadMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.wetMaterials.push(roadMat);
    const rt = A ? 4 : 6;
    const roadGeos = this.roads.map((r) => {
      const g = new THREE.PlaneGeometry(r.w, r.d);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * r.w) / rt, (uv.getY(i) * r.d) / rt);
      g.rotateX(-Math.PI / 2);
      g.translate(r.x, 0.01, r.z);
      return g;
    });
    const roads = new THREE.Mesh(mergeGeometries(roadGeos), roadMat);
    roads.receiveShadow = true;
    root.add(roads);
    // Marquage au sol
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xc9b56e, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.wetMaterials.push(lineMat);
    const lineGeos = [];
    for (let x = -66; x <= 66; x += 6) {
      if (Math.abs(x) < 6) continue;
      const g = new THREE.PlaneGeometry(2.4, 0.15); g.rotateX(-Math.PI / 2); g.translate(x, 0.02, 0); lineGeos.push(g);
      const g2 = new THREE.PlaneGeometry(0.15, 2.4); g2.rotateX(-Math.PI / 2); g2.translate(0, 0.02, x); lineGeos.push(g2);
    }
    const lines = new THREE.Mesh(mergeGeometries(lineGeos), lineMat);
    lines.receiveShadow = true;
    root.add(lines);
    // Modèles glTF
    if (A) {
      for (const m of this.models) {
        let o = A.clone(m.id);
        if (!o) continue;
        if (m.single && o.children.length > 1) {
          // le modèle contient plusieurs variantes côte à côte : n'en garder qu'une, recentrée
          const keep = o.children[0];
          o.clear(); o.add(keep);
          keep.position.x = 0; keep.position.z = 0;
        }
        o.position.set(m.x, m.y, m.z);
        o.rotation.set(m.rx, m.rot, 0);
        o.scale.setScalar(m.scale);
        root.add(o);
      }
    }
    this.scene.add(root);
    this.root = root;
  }

  /** Image de la minimap (vue de dessus). */
  buildMinimap(scale = 3) {
    const size = Math.ceil((HALF * 2 + 4) * scale);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3d3a30'; ctx.fillRect(0, 0, size, size);
    const toPx = (v) => (v + HALF + 2) * scale;
    ctx.fillStyle = '#2c2c2e';
    for (const r of this.roads) ctx.fillRect(toPx(r.x - r.w / 2), toPx(r.z - r.d / 2), r.w * scale, r.d * scale);
    const sorted = [...this.boxes].filter((b) => b.mat && b.mat !== 'glass').sort((a, b) => a.max.y - b.max.y);
    for (const b of sorted) {
      if (b.max.y < 0.2) continue;
      let col = MINIMAP_COLORS[b.mat];
      if (!col) col = b.mat.startsWith('c_') ? '#6a6f73' : b.mat.startsWith('car') ? '#5a5a5a' : '#777';
      ctx.fillStyle = col;
      ctx.fillRect(toPx(b.min.x), toPx(b.min.z), (b.max.x - b.min.x) * scale, (b.max.z - b.min.z) * scale);
    }
    ctx.fillStyle = '#5a5a5a';
    for (const c of this.minimapExtra || []) ctx.fillRect(toPx(c.x - c.w / 2), toPx(c.z - c.d / 2), c.w * scale, c.d * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    for (const b of sorted) {
      if (b.max.y < 1.5) continue;
      ctx.strokeRect(toPx(b.min.x), toPx(b.min.z), (b.max.x - b.min.x) * scale, (b.max.z - b.min.z) * scale);
    }
    return { canvas: c, scale, offset: HALF + 2 };
  }
}

function boxGeo(b, def) {
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
  const g = new THREE.BoxGeometry(w, h, d);
  if (!def.box) {
    const uv = g.attributes.uv, T = def.tile;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const offs = [[b.min.z, b.min.y], [b.min.z, b.min.y], [b.min.x, b.min.z], [b.min.x, b.min.z], [b.min.x, b.min.y], [b.min.x, b.min.y]];
    for (let f = 0; f < 6; f++)
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f][0] + offs[f][0]) / T, (uv.getY(i) * dims[f][1] + offs[f][1]) / T);
      }
  }
  g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  return g;
}
