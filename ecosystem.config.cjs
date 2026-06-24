module.exports = {
  apps: [
    {
      name: 'body-tracker',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        BODY_TRACKER_DATA_DIR: '/home/ubuntu/body-tracker-data',
      },
    },
  ],
};
