# Staging on Azure

Interim staging host until the DigitalOcean droplet is available. One small
Linux VM runs the game server behind Caddy. The database stays on Neon.

```
browser ──https──> Caddy :443 (VM) ──> server:3000 ──> Neon
```

- **VM:** `Standard_B1s` (1 vCPU, 1 GB RAM), Ubuntu 24.04. Azure's free
  services include 750 B1s hours a month, which covers one VM running all
  month. Other costs (public IP, disk) come out of the account credit.
- **HTTPS:** Caddy gets a Let's Encrypt certificate automatically for the VM's
  free Azure DNS name (`<label>.<region>.cloudapp.azure.com`) and proxies
  HTTP and WebSockets to the server. Ports 80 and 443 are open; SSH is open
  only from your IP.
- **Image:** built and published by the `Server image` workflow on every merge
  to `main` (`ghcr.io/changeplusplusvandy/civicdesigncenter:main`). The VM only
  pulls it; it's too small to build.

## 1. Accounts (once)

1. Create an [Azure](https://azure.microsoft.com/free/) account.
2. Install the Azure CLI (`winget install Microsoft.AzureCLI`) and run `az login`.
3. Make the GHCR package public after the first image is published (org
   **Packages → civicdesigncenter → Package settings → Change visibility**), so
   the VM can pull without credentials.

## 2. Create the VM

Run from the repo root. Some subscriptions only allow certain regions; if
`eastus` is refused, try `eastus2`, `centralus` or `westus2`. The DNS label
must be unique in the region.

```sh
az group create --name citysettlers-rg --location eastus

az vm create \
  --resource-group citysettlers-rg \
  --name citysettlers-staging \
  --image Ubuntu2404 \
  --size Standard_B1s \
  --admin-username azureuser \
  --generate-ssh-keys \
  --os-disk-size-gb 64 \
  --public-ip-address-dns-name citysettlers \
  --custom-data deploy/azure/cloud-init.yaml

# Web traffic for Caddy (HTTP is needed for the certificate challenge and redirects).
az vm open-port --resource-group citysettlers-rg --name citysettlers-staging \
  --port 80,443 --priority 900

# Only allow SSH from your current IP.
az network nsg rule update \
  --resource-group citysettlers-rg \
  --nsg-name citysettlers-stagingNSG \
  --name default-allow-ssh \
  --source-address-prefixes "$(curl -s https://api.ipify.org)/32"
```

`az vm create` prints `publicIpAddress` and `fqdn`
(`citysettlers.eastus.cloudapp.azure.com`). Set a monthly budget alert under
**Cost Management → Budgets** (for example $10) to catch surprises early.

## 3. Configure and start

```sh
ssh azureuser@<fqdn>
cloud-init status --wait          # first boot installs Docker; wait for "done"
cd /opt/citysettlers
base=https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/main/deploy/azure
curl -fsSLO "$base/compose.yml" && curl -fsSLO "$base/Caddyfile"
nano .env                          # see below
chmod 600 .env
docker compose -f compose.yml up -d
```

`/opt/citysettlers/.env` on the VM (never commit it):

```sh
SITE_ADDRESS=<fqdn, e.g. citysettlers.eastus.cloudapp.azure.com>
DATABASE_URL=<Neon pooled connection string>
SESSION_SECRET=<long random string: openssl rand -hex 32>
CORS_ORIGINS=<Vercel origin(s), comma-separated>
```

Check it: `curl https://<fqdn>/healthz` should return `{"ok":true,...}`.
Then set `VITE_API_URL=https://<fqdn>` in the Vercel project settings.

## Update to the latest `main`

```sh
ssh azureuser@<fqdn>
cd /opt/citysettlers && docker compose -f compose.yml pull && docker compose -f compose.yml up -d
```

Automating this from GitHub Actions is part of the deploy pipeline issue.

## Troubleshooting

- Logs: `docker compose -f compose.yml logs -f server` (or `caddy`).
- No certificate: ports 80 and 443 must be open, and `SITE_ADDRESS` must match
  the VM's `fqdn` exactly. Check the `caddy` logs.
- Your IP changed and SSH times out: rerun the `az network nsg rule update` command.
- Out of memory during a session: `free -h`; the VM has 1 GB RAM plus 1 GB swap.
