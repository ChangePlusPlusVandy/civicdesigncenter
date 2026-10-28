#!/usr/bin/env bash
# Redeploys the latest image. Installed at /opt/citysettlers/deploy.sh and run
# as the forced command of the GitHub Actions deploy key, so that key can do
# nothing else. Prints "ok" once /healthz answers.
#
# The image is private: Actions sends "deploy <token>" with its short-lived
# GITHUB_TOKEN, used for this pull only and logged out afterwards.
set -euo pipefail
cd /opt/citysettlers
cmd=${SSH_ORIGINAL_COMMAND:-}
if [ "${cmd#deploy }" != "$cmd" ]; then
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
  printf '%s' "${cmd#deploy }" | docker login ghcr.io -u github-actions --password-stdin >/dev/null
fi
docker compose pull --quiet
docker compose up -d --remove-orphans
# TODO: if Postgres moves onto the droplet (11/1 sync), run migrations here:
#   docker compose run --rm server npm run db:migrate
for i in $(seq 1 30); do
  docker compose exec -T server node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && { echo ok; exit 0; }
  sleep 2
done
docker compose logs --tail 100 server; exit 1
