#!/bin/bash
set -e

# Export env vars so cron jobs can access them
printenv | grep -v "no_proxy" >> /etc/environment

# Set up cron schedule (default: every 4 hours)
CRON_SCHEDULE="${SYNC_CRON:-0 */4 * * *}"
echo "$CRON_SCHEDULE cd /app && node dist/index.js import >> /proc/1/fd/1 2>> /proc/1/fd/2" > /etc/cron.d/amex-sync
chmod 0644 /etc/cron.d/amex-sync
crontab /etc/cron.d/amex-sync

echo "Cron scheduled: $CRON_SCHEDULE"

# Run import once on startup
node dist/index.js import || true

# Start cron in foreground
cron -f
