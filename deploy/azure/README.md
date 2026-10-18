# Staging on Azure (Azure for Students)

Interim staging host until the DigitalOcean droplet is available. One small
Linux VM runs the game server and a Cloudflare named tunnel. The database stays
on Neon.

```
browser ──https──> api.<domain> (Cloudflare) ──tunnel──> cloudflared ──> server:3000 ──> Neon
```

- **VM:** `Standard_B1s` (1 vCPU, 1 GB RAM), Ubuntu 24.04. Azure for Students
  includes 750 B1s hours a month, which covers one VM running all month. Other
  costs (public IP, disk) come out of the $100 student credit.
- **No inbound web ports.** `cloudflared` connects out to Cloudflare, so only
  SSH is open, and only from your IP.
- **Image:** built and published by the `Server image` workflow on every merge
  to `main` (`ghcr.io/changeplusplusvandy/civicdesigncenter:main`). The VM only
  pulls it; it's too small to build.

## 1. Accounts (once)

1. Sign up for [Azure for Students](https://azure.microsoft.com/free/students)
   with your school email. No card needed.
2. Install the Azure CLI (`winget install Microsoft.AzureCLI`) and run `az login`.
3. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels →
   Create a tunnel** (type _Cloudflared_) and name it `citysettlers-staging`.
   - Copy the **tunnel token** shown in the install command. You'll need it in step 3.
   - Add a public hostname `api.<domain>` → service `http://server:3000`.
4. Make the GHCR package public after the first image is published (org
   **Packages → civicdesigncenter → Package settings → Change visibility**), so
   the VM can pull without credentials.

## 2. Create the VM

Run from the repo root. Azure for Students only allows some regions; if
`eastus` is refused, try `eastus2`, `centralus` or `westus2`.

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
  --custom-data deploy/azure/cloud-init.yaml

# Only allow SSH from your current IP.
az network nsg rule update \
  --resource-group citysettlers-rg \
  --nsg-name citysettlers-stagingNSG \
  --name default-allow-ssh \
  --source-address-prefixes "$(curl -s https://api.ipify.org)/32"
```

`az vm create` prints `publicIpAddress`. Set a monthly budget alert under
**Cost Management → Budgets** (for example $10) to catch surprises early.

## 3. Configure and start

```sh
ssh azureuser@<publicIpAddress>
cloud-init status --wait          # first boot installs Docker; wait for "done"
cd /opt/citysettlers
curl -fsSLO https://raw.githubusercontent.com/ChangePlusPlusVandy/civicdesigncenter/main/deploy/azure/compose.yml
nano .env                          # see below
chmod 600 .env
docker compose -f compose.yml up -d
```

`/opt/citysettlers/.env` on the VM (never commit it):

```sh
DATABASE_URL=<Neon pooled connection string>
SESSION_SECRET=<long random string: openssl rand -hex 32>
CORS_ORIGINS=<Vercel origin(s), comma-separated>
TUNNEL_TOKEN=<Cloudflare tunnel token>
```

Check it: `curl https://api.<domain>/healthz` should return `{"ok":true,...}`.
Then set `VITE_API_URL=https://api.<domain>` in the Vercel project settings.

## Update to the latest `main`

```sh
ssh azureuser@<publicIpAddress>
cd /opt/citysettlers && docker compose -f compose.yml pull && docker compose -f compose.yml up -d
```

Automating this from GitHub Actions is part of the deploy pipeline issue.

## Troubleshooting

- Logs: `docker compose -f compose.yml logs -f server` (or `tunnel`).
- Tunnel shows "inactive" in Cloudflare: check `TUNNEL_TOKEN`, then the `tunnel` logs.
- Your IP changed and SSH times out: rerun the `az network nsg rule update` command.
- Out of memory during a session: `free -h`; the VM has 1 GB RAM plus 1 GB swap.
