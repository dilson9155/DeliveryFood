// PM2 ecosystem config para DeliveryFood.
// Idêntico ao padrão usado em beleza-saas.

module.exports = {
  apps: [
    {
      name: "delivery-food",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3006",
      cwd: "/var/www/delivery-food",
      // Fork mode (1 processo) — Next.js 16 não se dá bem com cluster mode do PM2.
      // O próprio Next.js gerencia concorrência com workers internos.
      instances: 1,
      exec_mode: "fork",
      env: {
          NODE_ENV: "production",
          PORT: "3006",
          HOSTNAME: "0.0.0.0",
        },
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/pm2/delivery-food-error.log",
      out_file: "/var/log/pm2/delivery-food-out.log",
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};