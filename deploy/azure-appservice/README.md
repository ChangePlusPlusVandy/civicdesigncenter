# Staging on Azure App Service

Interim staging host until the DigitalOcean droplet
([`../droplet`](../droplet/README.md)). The database is on Neon.

```
browser ──https──> citysettlers-cdc.azurewebsites.net (App Service, Node 24) ──> Neon
```

| Resource         | Name                                                           |
| ---------------- | -------------------------------------------------------------- |
| Subscription     | Azure for Students                                             |
| Resource group   | `rg-citysettlers` (westus)                                     |
| App Service plan | `asp-citysettlers`, Linux **F1 (free)**                        |
| Web app          | `citysettlers-cdc`: https://citysettlers-cdc.azurewebsites.net |
| Deploy identity  | `id-citysettlers-deploy` (user-assigned managed identity)      |

The subscription only allows these regions: `westus`, `canadacentral`,
`francecentral`, `norwayeast`, `belgiumcentral`. We use `westus` to keep
data in the US.

## How it's configured

- Runtime `NODE|24-lts`, startup command `node apps/server/dist/index.js`.
  The server also serves `apps/web/dist` (same origin).
- WebSockets on, HTTPS only, health check `/healthz`.
- App settings: `NODE_ENV`, `DATABASE_URL` (Neon pooled), `SESSION_SECRET`,
  `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. App Service sets `PORT`.
  Real values live only in Azure; list names with
  `az webapp config appsettings list -n citysettlers-cdc -g rg-citysettlers --query "[].name"`.

## Free tier limits (F1)

- Sleeps after about 20 idle minutes; the first request then takes a few seconds.
- 60 CPU-minutes per day and 1 GB RAM, one instance, no "Always On".

**On playtest days**, scale up to B1 (always on, no CPU quota, billed by the
hour from the student credit), then back down afterwards:

```sh
az appservice plan update -n asp-citysettlers -g rg-citysettlers --sku B1
az appservice plan update -n asp-citysettlers -g rg-citysettlers --sku F1
```

## Deploying

The deploy package is the built output plus a minimal `package.json`.
App Service runs `npm install` for the runtime dependencies (Oryx):

```
package.json           { "type": "module", "dependencies": <apps/server runtime deps, without @cs/*> }
apps/server/dist/      tsup bundle (workspace packages inlined)
apps/web/dist/         Vite build
```

**From GitHub Actions** (deploy pipeline issue): log in with OIDC, no secrets
needed. The managed identity trusts `repo:ChangePlusPlusVandy/civicdesigncenter:ref:refs/heads/main`
and has **Website Contributor** on the web app. The IDs are repo variables.

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: azure/login@v2
    with:
      client-id: ${{ vars.AZURE_CLIENT_ID }}
      tenant-id: ${{ vars.AZURE_TENANT_ID }}
      subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
  - uses: azure/webapps-deploy@v3
    with:
      app-name: ${{ vars.AZURE_WEBAPP_NAME }}
      package: app.zip
```

Only workflows running on `main` can log in. To allow other branches or
environments, add another federated credential to the identity.

**By hand** (anyone with access to the subscription):

```sh
npm ci && npm run build
# stage package.json + apps/server/dist + apps/web/dist as above, then zip it.
# On Windows use C:\Windows\System32\tar.exe -a -c -f app.zip package.json apps
# (Git Bash's tar writes a tar archive, not a zip).
az webapp deploy -n citysettlers-cdc -g rg-citysettlers --src-path app.zip --type zip
```

## Troubleshooting

- Live logs: `az webapp log tail -n citysettlers-cdc -g rg-citysettlers`
- Status and recent startup errors: `az webapp troubleshoot status -n citysettlers-cdc -g rg-citysettlers`
- Failed deploy details: `https://citysettlers-cdc.scm.azurewebsites.net/api/deployments/latest`
