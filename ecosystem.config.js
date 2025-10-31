module.exports = {
  apps: [
    {
      name: 'termux-code',
      script: 'backend/server.js',
      env: { PORT: 4000, NODE_ENV: 'production' }
    }
  ]
};