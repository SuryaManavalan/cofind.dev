#!/bin/bash
# COfind deploy runner — invoked over SSH by GitHub Actions.
# prod: main → cofind.dev (:80) · dev: develop → dev.cofind.dev (:8080)
set -euo pipefail

ENV="${1:?usage: remote-deploy.sh prod|dev}"
if [ "$ENV" = "prod" ]; then
  DIR=/opt/cofind/app BRANCH=main SVC=cofind PORT=80
else
  DIR=/opt/cofind-dev/app BRANCH=develop SVC=cofind-dev PORT=8080
fi

cd "$DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
npm install --no-audit --no-fund
npm run build
sudo systemctl restart "$SVC"
sleep 3

if [ "$ENV" = "dev" ]; then
  # Dev shares identity with prod: any registered founder can log into dev.
  bash /opt/cofind/app/deploy/sync-dev-users.sh
fi

# Refresh the installed runner from the main checkout (rename = safe self-update)
cp /opt/cofind/app/deploy/remote-deploy.sh /opt/cofind/deploy/.remote-deploy.tmp
mv /opt/cofind/deploy/.remote-deploy.tmp /opt/cofind/deploy/remote-deploy.sh

curl -fsS "localhost:$PORT/healthz"
echo " deploy($ENV) ok: $(git rev-parse --short HEAD)"
