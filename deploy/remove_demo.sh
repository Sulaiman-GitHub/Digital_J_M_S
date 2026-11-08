#!/bin/sh
# Removes ONLY the demo employers (emails ending @demo.example.test) and their vacancies.
# Real users, applications and CVs are not touched. Run on the server from this folder.
set -eu
cd "$(dirname "$0")"
docker compose --env-file .env.prod exec -T -e APP_ENV=development api python -c "
from app.db.session import get_sessionmaker
from app.services.demo_seed import reset_demo
with get_sessionmaker()() as db:
    removed = reset_demo(db)
    db.commit()
print(f'Removed {removed} demo employer account(s) and everything under them.')
"
