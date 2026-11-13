import * as THREE from 'three';
import { Game } from './game.js';
import { UI, loadSettings } from './ui.js';
import { Account } from './account.js';
import { Assets } from './assets.js';
import { setWeaponAssets } from './weapons.js';

const menu = document.getElementById('menu');
menu.innerHTML = `<div class="screen"><div class="logo">STRIKE<span>POINT</span></div>
  <div class="tagline" id="load-label">CHARGEMENT DES ASSETS…</div>
  <div class="loadbar"><i id="load-bar"></i></div></div>`;

const settings = loadSettings();
const account = new Account();
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });

const assets = new Assets();
await assets.load(renderer, (f, label) => {
  document.getElementById('load-bar').style.width = `${Math.round(f * 100)}%`;
  document.getElementById('load-label').textContent = `CHARGEMENT — ${label.replace(/_/g, ' ')} (${Math.round(f * 100)} %)`;
});
if (!assets.ok) console.warn('Assets indisponibles : rendu procédural de secours.');
setWeaponAssets(assets);

const game = new Game(document.getElementById('app'), settings, assets, renderer);
game.account = account;
const ui = new UI(game, account);

// accès console pour le débogage
window.__game = game;
window.__ui = ui;
window.__THREE = THREE;
window.__assets = assets;
