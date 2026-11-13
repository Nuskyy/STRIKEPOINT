# Installer STRIKEPOINT sur Debian

Remplacez `jeu.example.com` par votre domaine et `moi@serveur` par votre accès SSH.

## 1. Prérequis (sur le serveur)

```bash
sudo apt update && sudo apt install -y git nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Récupérer le code

```bash
sudo mkdir -p /opt/strikepoint && sudo chown $USER /opt/strikepoint
git clone <url-du-dépôt> /opt/strikepoint
cd /opt/strikepoint && npm ci
```

## 3. Copier les assets (depuis votre PC)

Les assets (~300 Mo) ne sont pas dans Git. Depuis le dossier du projet sur votre PC :

```bash
scp -r public/assets moi@serveur:/opt/strikepoint/public/
```

(ou `rsync -avz public/assets/ moi@serveur:/opt/strikepoint/public/assets/` pour les mises à jour suivantes)

Pour reprendre les comptes existants, copiez aussi `server/data/users.json` dans `/opt/strikepoint/server/data/`.

## 4. Compiler et lancer

```bash
cd /opt/strikepoint
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # puis exécuter la commande sudo qu'il affiche (redémarrage auto)
```

Vérification : `curl -I http://127.0.0.1:8081` doit répondre `200`.

## 5. nginx + HTTPS

```bash
sudo cp deploy/nginx-strikepoint.conf /etc/nginx/sites-available/strikepoint
sudo sed -i 's/jeu.example.com/VOTRE-DOMAINE/' /etc/nginx/sites-available/strikepoint
sudo ln -s /etc/nginx/sites-available/strikepoint /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d VOTRE-DOMAINE
```

Le DNS du domaine doit pointer vers l'IP du serveur. Ouvrez les ports 80 et 443 dans le pare-feu ; le port 8081 n'a pas besoin d'être ouvert.

## 6. Mises à jour

Sur votre PC : `git push`. Sur le serveur :

```bash
cd /opt/strikepoint && bash deploy/deploy.sh
```

Le script sauvegarde d'abord `server/data/users.json` dans `backups/` (30 dernières copies).

## 7. Travailler avec Claude Code sur le serveur

```bash
sudo npm install -g @anthropic-ai/claude-code
cd /opt/strikepoint && claude
```

Le fichier `CLAUDE.md` à la racine donne le contexte du projet à chaque nouvelle session.
Pour tester pendant le développement sur le serveur : `npm run dev` (ports 5173 et 8081) via un tunnel SSH :
`ssh -L 5173:localhost:5173 moi@serveur`, puis ouvrez http://localhost:5173 sur votre PC.

## Utile

- Journaux : `pm2 logs strikepoint`
- Redémarrer : `pm2 restart strikepoint`
- Sauvegarde manuelle des comptes : `cp server/data/users.json ~/users-backup.json`
