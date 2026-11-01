#!/usr/bin/env bash
# Redeploys the latest image. Installed at /opt/citysettlers/deploy.sh and run
# as the forced command of the GitHub Actions deploy key, so that key can do
# nothing else. Prints "ok" once /healthz answers.
#
# Actions sends "deploy <sha> <token>":
# - <sha>: the commit being deployed. The compose file (COMPOSE_FILE in .env)
#   is downloaded from that commit first, so it never drifts from the repo.
# - <token>: the job's short-lived GITHUB_TOKEN, used for this pull of the
#   private image only and logged out afterwards.
set -euo pipefail
cd /opt/citysettlers
read -r verb sha token _ <<<"${SSH_ORIGINAL_COMMAND:-}" || true
[ "${verb:-}" = deploy ] || sha= token=
# Older callers sent "deploy <token>" only.
[ -n "${sha:-}" ] && [ -z "${token:-}" ] && { token=$sha; sha=; }

if [ -n "${sha:-}" ]; then
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "bad sha" >&2; exit 2; }
  compose=$(sed -n 's/^COMPOSE_FILE=//p' .env | tail -1)
  compose=${compose:-compose.yml}
  [[ $compose =~ ^[A-Za-z0-9._-]+$ ]] || { echo "bad COMPOSE_FILE" >&2; exit 2; }
  curl -fsSL "https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/$sha/deploy/droplet/$compose" -o "$compose.new"
  mv "$compose.new" "$compose"
fi

if [ -n "${token:-}" ]; then
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
  printf '%s' "$token" | docker login ghcr.io -u github-actions --password-stdin >/dev/null
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
