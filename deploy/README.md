# Deployment (Azure VM)

Live at https://djmatch.polandcentral.cloudapp.azure.com. One Ubuntu VM (`djms-vm`, resource group
`djms-rg`) runs Docker Compose: Postgres, the API and Caddy (HTTPS and the built website).

## Automatic updates
Every push to `main` runs CI. When CI passes, `.github/workflows/deploy.yml` builds the website,
uploads the code, opens SSH for that run's IP only, restarts the containers and closes SSH again.
Secrets (GitHub repo settings): `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `AZURE_CREDENTIALS` (an Azure
identity limited to `djms-rg`). Server-only settings live in `~/djms/deploy/.env.prod` on the VM and
are never in git.

## On the server (`~/djms/deploy`)
- Status: `sudo docker compose --env-file .env.prod ps`; logs: `... logs api --tail 50`.
- Create the admin: `sudo docker compose --env-file .env.prod exec api python ../scripts/create_admin.py`.
- Remove the demo data: `sudo ./remove_demo.sh` (only `@demo.example.test` accounts).
- Database backup runs nightly at 02:30 into `backups/` (7 days). Uploaded CVs are not backed up.
