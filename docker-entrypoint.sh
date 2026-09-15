#!/bin/sh
set -e

echo "Veritabanı migration'ları uygulanıyor..."
cd /migrator
node node_modules/prisma/build/index.js migrate deploy

cd /app
exec node server.js
