# Staging and production on the shared DigitalOcean droplet

The game server runs on an existing DigitalOcean droplet that belongs to the
stakeholder. It is staging now and production for playtests. Azure App
Service ([`../azure-appservice/README.md`](../azure-appservice/README.md)) stays
as a manual fallback until the droplet passes a smoke test. The database stays
on Neon for now.

```
browser ──https──> Caddy or nginx (droplet) ──> server:3000 ──> Neon
```

## Ground rules (it's not our machine)

- **Only add things:** SSH keys, `/opt/citysettlers` and our Docker stack
  (Compose project `citysettlers`). A `deploy` user only with the owner's OK.
- **Never change** the root password, `sshd_config`, the firewall or existing
  users. Password login stays enabled.
- **Never touch** the other apps on the host (the old LC2 Meteor app) or their
  databases.
- Ask before binding ports 80/443 or 3000 if anything already uses them.
- No host addresses, passwords or keys in the repo, issues or PRs. They live
  in the GitHub Environment `droplet` and in `/opt/citysettlers/.env`.

## First-time setup

1. Add your personal SSH key: `ssh-copy-id root@<host>` (asks for the
   password once).
2. Run `bootstrap.sh` as root. It installs Docker and compose v2 only if
   missing, creates `/opt/citysettlers` and installs `deploy.sh`:

   ```sh
   base=https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/main/deploy/droplet
   ssh root@<host> "curl -fsSL $base/bootstrap.sh | bash -s -- --no-user"
   ```

   Without `--no-user` it also creates a `deploy` user (docker group, no sudo)
   that owns `/opt/citysettlers`.

3. Pick the proxy (next section), fetch its files into `/opt/citysettlers`
   and write `/opt/citysettlers/.env` (mode 600, never commit it):

   ```sh
   SITE_ADDRESS=<DNS name, e.g. citysettlers.example.org>   # Caddy only
   DATABASE_URL=<Neon pooled connection string>
   SESSION_SECRET=<openssl rand -hex 32>
   CORS_ORIGINS=<Vercel origin(s), comma-separated>
   # nginx / no-domain variant only:
   COMPOSE_FILE=compose.nginx.yml
   HOST_PORT=<free localhost port, default 3000>
   ```

4. `cd /opt/citysettlers && docker compose up -d`, then check `/healthz`
   returns `{"ok":true,...}`. Point `VITE_API_URL` in Vercel at the new host.

## Choosing the proxy

- **Nothing listens on 80/443:** use `compose.yml` + `Caddyfile`. Caddy owns
  80/443 and gets a Let's Encrypt certificate for `SITE_ADDRESS`. Confirm with
  the owner first: another app may need those ports later.
- **nginx already serves another app on 80/443:** use `compose.nginx.yml`
  (no Caddy; server on `127.0.0.1:${HOST_PORT}`) and add
  `nginx-site.conf.example` as a new server block for our subdomain only.
  Certificates via certbot only with the owner's OK.
- **Another app's `nginx-proxy` container (e.g. Meteor Up's) owns 80/443:**
  use `compose.nginx.yml` and, once there is a subdomain and the owner agrees,
  attach the server to that proxy's Docker network with `VIRTUAL_HOST` /
  `LETSENCRYPT_HOST` set to the subdomain. That proxy then routes and
  certifies it; nothing of the other app changes.
- **No domain yet:** use `compose.nginx.yml` without the nginx block and test
  through an SSH tunnel: `ssh -L 3000:127.0.0.1:<HOST_PORT> root@<host>`, then
  open http://localhost:3000.

## Deploys from GitHub Actions

`.github/workflows/deploy-droplet.yml` runs after every successful `Server
image` build on `main` (and on demand). It SSHes in with a dedicated key whose
`authorized_keys` line forces `deploy.sh`, so the key can only redeploy:

```
command="/opt/citysettlers/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... gha-deploy@civicdesigncenter
```

It goes in `~deploy/.ssh/authorized_keys`, or in `/root/.ssh/authorized_keys`
with a comment line naming the project when there is no `deploy` user.
`deploy.sh` pulls the image, restarts the stack and waits for `/healthz`.

GitHub Environment `droplet` (deployments from `main` only):

| Name                  | Kind     | Value                                                                            |
| --------------------- | -------- | -------------------------------------------------------------------------------- |
| `DROPLET_SSH_KEY`     | secret   | private half of the deploy key                                                   |
| `DROPLET_KNOWN_HOSTS` | secret   | pinned host key (`ssh-keyscan -t ed25519`, fingerprint checked against the host) |
| `DROPLET_HOST`        | secret   | host address                                                                     |
| `DROPLET_USER`        | variable | `deploy`, or `root` without a deploy user                                        |

The GHCR package must be public (org **Packages → civicdesigncenter → Package
settings → Change visibility**) so the droplet can pull without credentials.

Manual redeploy: `ssh root@<host> /opt/citysettlers/deploy.sh`.

## Backups

TODO (tracked in its own issue): nightly `pg_dump` or Neon branch export kept
off the box, with one restore drill before the first playtest.

## Troubleshooting

- Logs: `docker compose logs -f server` (or `caddy`) in `/opt/citysettlers`.
- No certificate: ports 80 and 443 must be open and the DNS name must resolve
  to the droplet.
- Out of memory: `free -h`. 1 GB RAM plus 1 GB swap is the minimum.

## If we ever get our own droplet

Create an Ubuntu 24.04 droplet with `cloud-init.yaml` as user data (put your
SSH public key in it), allow ports 22 (your IP only), 80 and 443, point a DNS
name at it, then follow steps 3–4 above with `compose.yml`.
