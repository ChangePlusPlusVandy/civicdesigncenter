#!/usr/bin/env bash
# First-time setup on an existing, shared host (run as root). Idempotent.
# Only adds things: Docker + compose v2 if missing, a `deploy` user (docker
# group, no sudo), /opt/citysettlers and deploy.sh. It never touches sshd,
# the firewall, passwords or other users.
#
#   sudo bash bootstrap.sh             # with a deploy user
#   sudo bash bootstrap.sh --no-user   # files owned by root (deploy key on root)
set -euo pipefail

owner=deploy
[ "${1:-}" = "--no-user" ] && owner=root
base=https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/main/deploy/droplet

if ! command -v docker >/dev/null; then
  apt-get update && apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
elif ! docker compose version >/dev/null 2>&1; then
  # Docker's own packages (docker-ce) ship compose as docker-compose-plugin.
  if dpkg -s docker-ce >/dev/null 2>&1; then
    apt-get update && apt-get install -y docker-compose-plugin
  else
    apt-get update && apt-get install -y docker-compose-v2
  fi
fi

if [ "$owner" = deploy ] && ! id deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G docker deploy
fi
install -d -o "$owner" -g "$owner" /opt/citysettlers
[ "$owner" = deploy ] && install -d -m 700 -o deploy -g deploy ~deploy/.ssh

curl -fsSL "$base/deploy.sh" -o /opt/citysettlers/deploy.sh
chown "$owner:$owner" /opt/citysettlers/deploy.sh
chmod 755 /opt/citysettlers/deploy.sh
echo "bootstrap done (owner: $owner)"
