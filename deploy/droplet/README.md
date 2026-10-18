# Production on the DigitalOcean droplet (planned)

Used once droplet access is granted. Until then, staging runs on Azure App
Service; see [`../azure-appservice/README.md`](../azure-appservice/README.md).

The droplet runs the server image behind Caddy. The database stays on Neon.

```
browser ──https──> Caddy :443 (droplet) ──> server:3000 ──> Neon
```

- **Image:** built and published by the `Server image` workflow on every
  merge to `main` (`ghcr.io/changeplusplusvandy/civicdesigncenter:main`). The
  droplet only pulls it. Make the GHCR package public (org **Packages →
  civicdesigncenter → Package settings → Change visibility**) so it can pull
  without credentials.
- **HTTPS:** Caddy gets a Let's Encrypt certificate for `SITE_ADDRESS`
  automatically and proxies HTTP and WebSockets to the server. It needs a DNS
  name pointing at the droplet and ports 80 and 443 open.

## Set up

1. Create an Ubuntu 24.04 droplet (1 GB RAM is enough). Use `cloud-init.yaml`
   as user data, with your SSH public key in it. Allow ports 22 (your IP only),
   80 and 443 in the firewall.
2. Point a DNS name at the droplet's IP.
3. Configure and start:

   ```sh
   ssh deploy@<host>
   cloud-init status --wait          # first boot installs Docker
   cd /opt/citysettlers
   base=https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/main/deploy/droplet
   curl -fsSLO "$base/compose.yml" && curl -fsSLO "$base/Caddyfile"
   nano .env && chmod 600 .env       # see below
   docker compose up -d
   ```

`/opt/citysettlers/.env` (never commit it):

```sh
SITE_ADDRESS=<DNS name, e.g. citysettlers.example.org>
DATABASE_URL=<Neon pooled connection string>
SESSION_SECRET=<long random string: openssl rand -hex 32>
CORS_ORIGINS=<Vercel origin(s), comma-separated>
```

Check it: `curl https://<host>/healthz` returns `{"ok":true,...}`. Then
point `VITE_API_URL` in Vercel at the new host.

## Update to the latest `main`

```sh
ssh deploy@<host> 'cd /opt/citysettlers && docker compose pull && docker compose up -d'
```

## Troubleshooting

- Logs: `docker compose logs -f server` (or `caddy`).
- No certificate: ports 80 and 443 must be open and the DNS name must resolve
  to the droplet.
- Out of memory: `free -h`. 1 GB RAM plus 1 GB swap is the minimum.
