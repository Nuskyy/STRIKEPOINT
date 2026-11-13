// Configuration pm2 : `pm2 start deploy/ecosystem.config.cjs` puis `pm2 save`.
module.exports = {
  apps: [
    {
      name: 'strikepoint',
      script: 'server/server.js',
      cwd: __dirname + '/..',
      env: { NODE_ENV: 'production', GAME_PORT: 8081, TRUST_PROXY: '1' },
      max_memory_restart: '600M',
      time: true,
    },
  ],
};
