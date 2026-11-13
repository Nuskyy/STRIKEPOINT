# STRIKEPOINT — FPS navigateur (Three.js)

## Lancer

```bash
npm install
npm run dev          # jeu (http://localhost:5173) + serveur comptes/multijoueur (port 8081)
```

Production (un seul serveur qui sert le jeu compilé, l'API et le multijoueur) :

```bash
npm run start        # build + http://localhost:8081
```

Variable `GAME_PORT` pour changer le port du serveur.

## Assets photo-réalistes

Textures PBR, ciel HDRI et modèles 3D proviennent de [Poly Haven](https://polyhaven.com) (CC0, voir `public/assets/CREDITS.md`).
Ils ne sont pas versionnés ; pour les (re)télécharger (~135 Mo) :

```bash
node scripts/fetch-assets.mjs
```

Sans ces fichiers, le jeu se rabat automatiquement sur les textures procédurales.

Armes et sons réels : « Free Classic Weapons Pack » de Stein Games (CC0, https://stein-indie.itch.io/classic-weapons-pack).
Téléchargez `Classic Weapons Pack v1.1.zip` et `audio.zip`, extrayez-les dans `downloads/weapons_raw` et `downloads/audio_raw`,
puis lancez `powershell -File scripts/prepare-weapons.ps1` (textures converties dans `public/assets/weapons/`).
Les sons utilisés sont copiés dans `public/assets/sounds/` (voir `manifest.json`).

## Classes, accessoires et niveaux

- 5 classes personnalisables (menu « Modifier les classes ») : arme principale, viseur, bouche, sous le canon,
  chargeur, finition et opérateur (personnage). Chaque accessoire modifie les statistiques (`src/shared/loadout.js`).
- XP : élimination 100, tir à la tête +50, vague 250, partie 200, victoire 500. 55 niveaux avec grades ;
  armes, accessoires, finitions et opérateurs se débloquent par niveau (`src/shared/progression.js`).
- L'XP et les classes sont enregistrées sur le compte (validées par le serveur) ; en invité, localement.

## Comptes

- Nom d'utilisateur (3–16 caractères : lettres, chiffres, `_ - .`) + mot de passe (6+ caractères). Aucune adresse e-mail.
- Mots de passe hachés avec scrypt et un sel par compte ; sessions par jeton aléatoire (30 jours).
- Limitation des tentatives de connexion par IP ; un compte ne peut être connecté qu'une fois en multijoueur.
- Statistiques persistées (éliminations, ratio, précision, meilleure vague…) et classement.
- Données : `server/data/users.json` (ignoré par git). Un mot de passe oublié ne peut pas être récupéré.
- Mode invité disponible pour le solo (statistiques non enregistrées).

## Structure

| Fichier | Rôle |
|---|---|
| `src/game.js` | Boucle, rendu, post-traitement, modes de jeu |
| `src/map.js` / `src/scenery.js` | Carte (collisions) / décor (terrain, herbe, forêt, véhicules, props) |
| `src/player.js`, `src/weapons.js` | Contrôleur FPS, armes 1re personne |
| `src/bot.js`, `src/nav.js` | IA et pathfinding A* |
| `src/net.js`, `server/server.js` | Multijoueur WebSocket |
| `src/account.js`, `server/accounts.js` | Système de comptes |
