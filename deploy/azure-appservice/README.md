# Azure App Service (retired fallback)

Azure was the interim staging host before the droplet
([`../droplet`](../droplet/README.md)). It was deleted on 2026-11-01. Follow
this guide to set it up again, for example if the droplet becomes unavailable.

```
browser ──https──> <app>.azurewebsites.net (App Service, Node 24) ──> Neon
```

The server serves `apps/web/dist` itself (same origin). There is no Docker
here: App Service runs the built output on its Node runtime.

## 1. Create the resources

Use the Azure for Students subscription. It allows only `westus`,
`canadacentral`, `francecentral`, `norwayeast` and `belgiumcentral`; use
`westus` to keep data in the US. Web app names are global, so pick a free one.

```sh
RG=rg-citysettlers APP=citysettlers-cdc PLAN=asp-citysettlers
az group create -n $RG -l westus
az appservice plan create -n $PLAN -g $RG --is-linux --sku F1
az webapp create -n $APP -g $RG -p $PLAN --runtime "NODE:24-lts" \
  --startup-file "node apps/server/dist/index.js"
az webapp config set -n $APP -g $RG --web-sockets-enabled true \
  --min-tls-version 1.2 --ftps-state FtpsOnly
az webapp update -n $APP -g $RG --https-only true
az webapp config set -n $APP -g $RG --generic-configurations '{"healthCheckPath": "/healthz"}'
```

## 2. App settings

App Service sets `PORT` itself. Type the secrets in your own shell, never in
the repo:

```sh
az webapp config appsettings set -n $APP -g $RG --settings \
  NODE_ENV=production SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  DATABASE_URL="<Neon pooled URL>" SESSION_SECRET="$(openssl rand -hex 32)"
```

Add the new origin to `CORS_ORIGINS` wherever the Vercel previews point, and
set `VITE_API_URL` in Vercel to `https://$APP.azurewebsites.net`.

## 3. Deploy

The package is the built output plus a minimal `package.json`; App Service
runs `npm install` for the runtime dependencies (Oryx):

```
package.json           { "type": "module", "dependencies": <apps/server runtime deps, without @cs/*> }
apps/server/dist/      tsup bundle (workspace packages inlined)
apps/web/dist/         Vite build
```

```sh
npm ci && npm run build
# stage package.json + apps/server/dist + apps/web/dist as above, then zip it.
# On Windows use C:\Windows\System32\tar.exe -a -c -f app.zip package.json apps
# (Git Bash's tar writes a tar archive, not a zip).
az webapp deploy -n $APP -g $RG --src-path app.zip --type zip
curl https://$APP.azurewebsites.net/healthz
```

## 4. Optional: deploy from GitHub Actions

Log in with OIDC, so no secret is stored. Create a managed identity that trusts
`main`, and give it Website Contributor on the app:

```sh
az identity create -n id-citysettlers-deploy -g $RG
az identity federated-credential create -n github-main -g $RG \
  --identity-name id-citysettlers-deploy \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:ChangePlusPlusVandy/civicdesigncenter:ref:refs/heads/main \
  --audiences api://AzureADTokenExchange
az role assignment create --role "Website Contributor" \
  --assignee "$(az identity show -n id-citysettlers-deploy -g $RG --query principalId -o tsv)" \
  --scope "$(az webapp show -n $APP -g $RG --query id -o tsv)"
```

Set repo variables `AZURE_CLIENT_ID` (the identity's `clientId`),
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and `AZURE_WEBAPP_NAME`, then:

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

## Free tier (F1) limits

- Sleeps after about 20 idle minutes; the first request then takes a few seconds.
- 60 CPU-minutes per day, 1 GB RAM, one instance, no "Always On".
- For playtests, scale up to B1 (billed hourly from the student credit) and
  back down afterwards: `az appservice plan update -n $PLAN -g $RG --sku B1`
  (then `--sku F1`).

## Troubleshooting

- Live logs: `az webapp log tail -n $APP -g $RG`
- Failed deploy details: `https://$APP.scm.azurewebsites.net/api/deployments/latest`

## Removing it again

```sh
az group delete -n $RG --yes
gh variable delete AZURE_CLIENT_ID   # and the other AZURE_* variables
```
