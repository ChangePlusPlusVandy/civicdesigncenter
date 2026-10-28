# Droplet (staging + playtest production)

Server image from GHCR on the stakeholder's DigitalOcean droplet. DB on Neon.
Azure App Service is the fallback ([`../azure-appservice`](../azure-appservice/README.md)).

## Setup

- **Shared host: add only.** Our files live in `/opt/citysettlers`; don't
  change other apps, users, sshd or the firewall.
- **Docker:** Compose project `citysettlers` (`compose.nginx.yml`), image
  `ghcr.io/changeplusplusvandy/civicdesigncenter:main` (package must be public).
- **Ports:** 80/443 are already bound by another app, so the server binds
  `127.0.0.1:${HOST_PORT}` (default 3000).
- **GitHub Environment `droplet`** (`main` only): secrets `DROPLET_SSH_KEY`,
  `DROPLET_KNOWN_HOSTS`, `DROPLET_HOST`; variable `DROPLET_USER`.

First time, as root: `bash bootstrap.sh --no-user` (installs Docker if
missing, creates `/opt/citysettlers`, installs `deploy.sh`), then copy
`compose.nginx.yml` there and write `.env` (mode 600):

```sh
COMPOSE_FILE=compose.nginx.yml
HOST_PORT=3000
DATABASE_URL=<Neon pooled URL>
SESSION_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=<Vercel origins, comma-separated>
```

## Deploy

`deploy-droplet.yml` runs after each `Server image` build on `main`. Its SSH
key is restricted to `deploy.sh` (pull, `up -d`, wait for `/healthz`):

```
command="/opt/citysettlers/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA...
```

Manual: `ssh root@<host> /opt/citysettlers/deploy.sh`. Logs:
`docker compose logs -f server`. Test: `ssh -L 3000:127.0.0.1:3000 root@<host>`,
then http://localhost:3000/healthz.

## Own droplet

`cloud-init.yaml` + `compose.yml` + `Caddyfile` (Caddy on 80/443 with
automatic HTTPS for `SITE_ADDRESS`).
