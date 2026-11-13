# STRIKEPOINT — notes pour Claude

FPS navigateur en Three.js (r170) + serveur Node (comptes, multijoueur). Interface et commentaires en français.

## Lancer
- `npm run dev` : Vite (5173) + serveur Node (8081, variable `GAME_PORT`) via `scripts/dev.mjs`. Vite proxifie `/api` et `/ws`.
- `npm run start` : build + serveur unique sur 8081 (sert `dist/`, `/api/*`, WebSocket `/ws`).
- Le serveur Node n'est PAS rechargé à chaud : le relancer après une modification de `server/`.
- Débogage navigateur : `window.__game`, `__ui`, `__THREE`, `__assets`; `__game.god = true` = invincible.

## Architecture (src/)
- `game.js` boucle, rendu, post-traitement (bloom, GTAO, rayons de soleil, étalonnage, grain), modes `waves` / `tdm` / `mp`, dégâts, séries.
- `map.js` carte en boîtes AABB (collisions exactes) + modèles placés (`model()` calcule la collision depuis la bbox). `layoutModels()` seulement si les assets sont chargés.
- `scenery.js` terrain, herbe instanciée, forêt, poteaux + câbles, flaques/vitres, pluie (désactivée). `buildings.js` immeubles assemblés depuis les kits de façades Poly Haven (toile de fond hors enceinte). `props.js` voitures profilées, sacs de sable, caisses, palettes, bureaux, cadres de conteneurs.
- `wet.js` reflet planaire du sol (y=0) injecté dans les matériaux + rayons de soleil.
- `player.js`, `weapons.js` (vue 1re personne), `gunmodels.js` (armes procédurales + armes réelles `buildRealGun`), `hands.js` (mains/bras détaillés).
- `bot.js` IA, `nav.js` A*, `character.js` soldats réalistes (Soldier.glb, IK des bras vers l'arme), `soldier.js` repli procédural.
- `net.js` client multi, `account.js` comptes/profil invité, `ui.js` menus + éditeur de classes, `hud.js`.
- `shared/` partagé client/serveur : `stats.js` (armes), `loadout.js` (accessoires, classes, `effectiveStats`), `progression.js` (XP/niveaux), `spawns.js`.
- `server/server.js` HTTP + WebSocket, `server/accounts.js` comptes (scrypt, jetons, XP, classes validées côté serveur). Données : `server/data/users.json` (NE JAMAIS supprimer ni écraser : contient les comptes réels).

## Assets (non versionnés, `public/assets/`)
- Poly Haven CC0 : textures PBR, HDRI, modèles → `node scripts/fetch-assets.mjs`.
- Armes + sons : « Free Classic Weapons Pack » Stein Games (CC0, itch.io) → `scripts/prepare-weapons.ps1` (FBX + textures converties, RMAO→ARM). Sons dans `public/assets/sounds/` + `manifest.json`.
- Personnage : `characters/Soldier.glb` (exemples three.js / Mixamo).
- Sans assets, le jeu se rabat sur le rendu procédural.
- Repères des armes réelles : table `REAL` de `gunmodels.js` (points [y, z] du modèle : poignée, appui, organes de visée, bouche, rail).

## Conventions
- Les entités font face à -z (yaw 0) ; avant = (-sin yaw, 0, -cos yaw).
- Les FBX d'armes sont en cm, canon vers +z : convertis en maillages statiques (`bakeStatic`) puis tournés de π.
- Toujours demander avant de télécharger des fichiers ; lister nom, source, taille.

## Pistes / à faire
- Vérifier le placement des mains sur MP5, M14, M700, 1911 (seul l'AK-47 a été réglé).
- Bâtiments jouables au centre : formes simples (habillage par façades modulaires possible mais à aligner sur les collisions).
- Monument central basique ; fusil à pompe procédural (pas de modèle réel).
