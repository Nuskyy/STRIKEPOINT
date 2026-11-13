// Lance le serveur (comptes + multijoueur, port 8081) et Vite (port 5173) ensemble.
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['server/server.js'], { stdio: 'inherit' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'], { stdio: 'inherit' });

const stop = () => { server.kill(); vite.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (c) => { if (c) console.error(`Serveur arrêté (code ${c})`); });
vite.on('exit', () => stop());
