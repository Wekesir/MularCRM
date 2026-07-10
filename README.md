# OMNICRM

A full-stack CRM starter with a React frontend, Express API, MySQL database, and phpMyAdmin — all orchestrated with Docker Compose.

## Tech stack

| Layer      | Technology              |
|------------|-------------------------|
| Frontend   | React 18, Vite          |
| Backend    | Node.js, Express        |
| Database   | MySQL 8                 |
| Admin UI   | phpMyAdmin              |
| Containers | Docker, Docker Compose  |

## Project structure

```
OMNICRM/
├── backend/           # Express API
│   ├── src/
│   │   ├── db/pool.js
│   │   ├── middleware/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── frontend/          # React app (Vite)
│   ├── src/
│   │   ├── api/client.js
│   │   ├── components/Sidebar.jsx
│   │   ├── layouts/AppLayout.jsx
│   │   ├── pages/           # One page per CRM module
│   │   ├── routes/modules.js
│   │   └── App.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── MODULES.md         # Module descriptions and workflows
└── README.md
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

For local development without Docker for the app services, you also need:

- [Node.js](https://nodejs.org/) 20+
- npm 10+

## How to run the project

### Option 1 — Full stack with Docker (recommended)

Use this when you want everything running with one command.

1. Clone or open the project and go to the root directory:

   ```bash
   cd OMNICRM
   ```

2. Create your environment file from the template:

   ```bash
   cp .env.example .env
   ```

   Review `.env` and change passwords or ports if needed.

3. Build and start all containers:

   ```bash
   docker compose up -d --build
   ```

   This starts MySQL, phpMyAdmin, the Express API, and the React frontend.

4. Check that all services are running:

   ```bash
   docker compose ps
   ```

   All services should show `Up`. MySQL should show `(healthy)`.

5. Open the apps in your browser:

   | Service    | URL                          |
   |------------|------------------------------|
   | Frontend   | http://localhost:5173        |
   | Backend    | http://localhost:3000        |
   | phpMyAdmin | http://localhost:8080        |
   | MySQL      | localhost:3307               |

6. Verify the API and database:

   ```bash
   curl http://localhost:3000/api/health
   ```

   Expected response:

   ```json
   { "status": "ok", "backend": "up", "database": "connected" }
   ```

7. View logs if something fails:

   ```bash
   docker compose logs -f backend
   docker compose logs -f mysql
   ```

8. Stop the project:

   ```bash
   docker compose down
   ```

### Option 2 — Local frontend and backend, Docker for database

Use this when you want hot reload on your machine while MySQL and phpMyAdmin stay in Docker.

1. Start only the database services:

   ```bash
   docker compose up -d mysql phpmyadmin
   ```

2. Create a backend environment file:

   ```bash
   cat > backend/.env <<'EOF'
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3307
   DB_USER=omnicrm
   DB_PASSWORD=omnicrm_password
   DB_NAME=omnicrm
   CORS_ORIGIN=http://localhost:5173
   EOF
   ```

3. Install and run the backend:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. In a second terminal, install and run the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Open http://localhost:5173 and confirm the API status card shows a healthy response.

### First-time checklist

- [ ] Docker is installed and running
- [ ] `.env` exists at the project root
- [ ] Port `3307` is free (or change `MYSQL_PORT` in `.env`)
- [ ] Port `3000`, `5173`, and `8080` are free
- [ ] `curl http://localhost:3000/api/health` returns `"status": "ok"`

### Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| MySQL fails to start | Port 3306 or 3307 already in use | Change `MYSQL_PORT` in `.env` to another port, then run `docker compose up -d` |
| Backend returns 503 | Database not ready yet | Wait for MySQL to become healthy: `docker compose ps` |
| Frontend cannot reach API | Wrong `VITE_API_URL` | Set `VITE_API_URL=http://localhost:3000` in `.env` and restart frontend |
| Changes not appearing in Docker | Cached container | Run `docker compose up -d --build` |

## phpMyAdmin

Open http://localhost:8080 and sign in with one of these accounts:

| Role  | Username | Password          | Database |
|-------|----------|-------------------|----------|
| Root  | `root`   | `rootpassword`    | all      |
| App   | `omnicrm`| `omnicrm_password`| `omnicrm`|

The MySQL host is pre-configured inside Docker. When connecting from phpMyAdmin in the browser, use the credentials above — no manual host entry is required.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable              | Default                  | Description                    |
|-----------------------|--------------------------|--------------------------------|
| `MYSQL_ROOT_PASSWORD` | `rootpassword`           | MySQL root password            |
| `MYSQL_DATABASE`      | `omnicrm`                | Application database name      |
| `MYSQL_USER`          | `omnicrm`                | Application database user      |
| `MYSQL_PASSWORD`      | `omnicrm_password`       | Application database password  |
| `MYSQL_PORT`          | `3307`                   | Host port for MySQL            |
| `BACKEND_PORT`        | `3000`                   | Host port for the API          |
| `FRONTEND_PORT`       | `5173`                   | Host port for the React app    |
| `PHPMYADMIN_PORT`     | `8080`                   | Host port for phpMyAdmin       |
| `CORS_ORIGIN`         | `http://localhost:5173`  | Allowed frontend origin        |
| `VITE_API_URL`        | `http://localhost:3000`  | API URL used by the frontend   |
| `FRONTEND_URL`        | `http://localhost:5173`  | Base URL for password reset links |
| `JWT_SECRET`          | *(required in production)* | Signs login session tokens   |
| `AUTH_SESSION_TIMEZONE` | `Africa/Nairobi`       | Timezone for session-until-midnight |
| `REPORT_UNLOCK_SECRET` | *(required in production)* | Report password unlock tokens |

MySQL is mapped to port **3307** by default to avoid conflicts with a local MySQL instance on 3306.

## Authentication

Sign in at `/login`. All app routes require authentication.

| Step | Route | Description |
|------|-------|-------------|
| 1 | `/login` | Email + password |
| 2 | `/login/verify-otp` | 6-digit OTP sent by email (and SMS when configured) |
| 3 | App | Session stays active until midnight in `AUTH_SESSION_TIMEZONE` |

**Default admin account** (seeded on first database init):

| Email | Password |
|-------|----------|
| `admin@omnicrm.com` | `ChangeMe123!` |

You will be prompted to change this password after first sign-in. Configure **Communication Integration** (Resend or SMTP) under System Configurations before OTP login can send emails.

**Password reset:** `/forgot-password` sends a reset link when the email exists. `/reset-password?token=...` sets a new password.

**Device unlock (passkeys):** After signing in, open **Profile → Device Unlock** to register a local platform authenticator. Prefer **this device** if Chrome offers Google Password Manager — synced Google passkeys unlock with a Google PIN, not the laptop fingerprint. On many Linux + Chrome setups the browser cannot use `fprintd` for WebAuthn, so fingerprint may be unavailable even when OS login uses it; password + OTP remains the fallback. On the login page, enter your email and use **Sign in with fingerprint**. Requires HTTPS in production; `localhost` works for development. Optional env: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME` (defaults from `FRONTEND_URL`).

## CRM modules

The frontend includes 13 module pages (sidebar navigation). Visiting `/` redirects to `/dashboard` when signed in.

See [MODULES.md](MODULES.md) for a full description of each module, how it works, and which user roles it serves.

## Docker commands

```bash
# Start services in the background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Stop services and remove the database volume
docker compose down -v

# Rebuild after dependency changes
docker compose up -d --build
```

## CI / GHCR

Pushes to `main` run [`.github/workflows/ci-ghcr.yml`](.github/workflows/ci-ghcr.yml):

1. **Lint** — runs `npm run lint` in `frontend` and `backend` when those scripts exist; otherwise skips (stub).
2. **Build and push** — builds production images from `Dockerfile.prod` and pushes them to GitHub Container Registry.
3. **Deploy to Render** — after a successful push, triggers Render deploy hooks so the live services pull the new images.

| Image | Tags |
|-------|------|
| `ghcr.io/<owner>/<repo>/backend` | `latest`, short commit SHA |
| `ghcr.io/<owner>/<repo>/frontend` | `latest`, short commit SHA |

The workflow uses the default `GITHUB_TOKEN` with `packages: write`. After the first push, open the package under **GitHub → Packages** if you want to change visibility (e.g. public).

Optional: set a repository variable `VITE_API_URL` so the frontend production image bakes in your API base URL at build time.

Local `docker compose` still uses the development `Dockerfile`s; production images are for registry/deploy use only.

### Deploy to Render (one-time setup)

Render does **not** auto-redeploy when a new image is pushed to GHCR. The workflow calls deploy hooks after each successful build.

1. In Render, create two **Web Services** that deploy a **prebuilt Docker image**:
   - Backend: `ghcr.io/<owner>/<repo>/backend:latest` (port `3000`)
   - Frontend: `ghcr.io/<owner>/<repo>/frontend:latest` (port `80`)
2. If the GHCR packages are private, add a **registry credential** in Render (GitHub PAT with `read:packages`) and attach it to both services.
3. Set backend env vars on Render (`DB_*`, `JWT_SECRET`, etc.) and point the frontend build variable `VITE_API_URL` at your live API URL before the next CI build.
4. On each service → **Settings → Deploy Hook**, copy the hook URL.
5. In GitHub → **Settings → Secrets and variables → Actions**, add:
   - `RENDER_BACKEND_DEPLOY_HOOK`
   - `RENDER_FRONTEND_DEPLOY_HOOK`

After that, every push to `main` that builds successfully will redeploy both services with the commit SHA image tag.

## Database backup (Google Drive)

System admins can configure automatic MySQL backups under **System Configurations → Database Backup**.

1. In Google Cloud, create a **service account**, enable the **Google Drive API**, and download a JSON key.
2. Create (or pick) a Drive folder and share it with the service account email as **Editor**.
3. Copy the folder ID from the URL (`https://drive.google.com/drive/folders/FOLDER_ID`).
4. In OMNICRM, paste the folder ID and JSON key, choose **Daily** (default), **Weekly**, or **Monthly**, enable backups, and save.
5. Use **Run backup now** to verify. Scheduled runs use `node-cron` at 02:00 in `AUTH_SESSION_TIMEZONE` (default `Africa/Nairobi`).

The backend runs `mysqldump` (requires `mysql-client` in the backend image) and uploads a timestamped `.sql` file to that Drive folder.

## Live payments API integration

Instead of uploading a debtor CSV every day, system admins can configure **per-client** lender APIs under **System Configurations → Integrations**.

### How it works

1. OMNICRM sends `POST {endpointUrl}` with body `{ "date": "YYYY-MM-DD" }` and `Authorization: Bearer <apiKey>` (header name configurable).
2. The lender responds with a JSON **array** of debtor objects, or `{ "debtors": [ … ] }` (also accepts `data` / `rows`).
3. Each object uses the **same field names as the debtor CSV template** (31 columns), e.g. `full_name`, `loan_id`, `phone_number`, `amount`, `amount_repaid`, `arrears`, `dpd_level`, …
4. Rows are upserted by `(client_id, loan_id)` — same rules as CSV bulk upload (payment deltas included).
5. **Case file (CFID):** API pulls use **one `debtor_files` row per client per calendar day** (`batch_date`). If none exists, it is created; later pulls the same day append to that CFID. New loans get that day’s CFID; existing loans keep their original CFID on update.

### Developer notes

| Topic | Detail |
|-------|--------|
| Shared importer | [`backend/src/services/debtorImportShared.js`](backend/src/services/debtorImportShared.js) — CSV and API share `importDebtorRows` |
| API service | [`backend/src/services/livePaymentsApiService.js`](backend/src/services/livePaymentsApiService.js) — contract documented in the file header |
| Cron | Configurable poll interval via `integrations.livePayments.frequency`: `every_1_min`, `every_5_min`, `every_15_min`, `every_30_min`, `hourly`, or `daily` (06:00). Timezone: `AUTH_SESSION_TIMEZONE` (default `Africa/Nairobi`). Overlapping runs are skipped. Shorter intervals approximate near-realtime payment visibility for agents. |
| Routes | `GET /api/live-payments/status`, `POST /api/live-payments/pull`, `POST /api/live-payments/test-connection` (system admin) |
| Config | `system_config.integrations.livePayments` — `enabled`, `frequency`, `clients[]` |
| CSV vs API | Manual CSV upload still creates a **new** case file every time; only API pulls reuse the same-day CFID |

### Example lender response

```json
{
  "date": "2026-07-10",
  "debtors": [
    {
      "full_name": "Jane Mwangi",
      "phone_number": "254710595755",
      "loan_id": "LN-2025-0001",
      "id_number": "30123456",
      "amount": "150000",
      "amount_repaid": "45000",
      "arrears": "105000",
      "dpd_level": "45",
      "loan_taken_date": "2025-01-15",
      "physical_address": "12 MG Rd, Nairobi",
      "next_of_kin_full_name": "Brian Mwangi",
      "next_of_kin_phone_number": "254733222333",
      "guarantor_full_name": "Peter Otieno",
      "guarantor_phones": "254711444555"
    }
  ]
}
```

Required fields match the CSV bulk-upload required columns. Optional CSV columns may be omitted or left blank.

## Backend middleware

All `/api` routes (except `/api/health`) pass through two middleware checks before any request is handled:

| Middleware           | Purpose                                      |
|----------------------|----------------------------------------------|
| `ensureBackendUp`    | Confirms the server has finished starting    |
| `ensureDatabaseUp`   | Runs `SELECT 1` to confirm MySQL is reachable |

If either check fails, the API responds with HTTP `503` and a JSON error body. Use `/api/health` for diagnostics without triggering the database gate on other routes.

## Frontend API client

API calls use [axios](https://axios-http.com/) via a shared client at `frontend/src/api/client.js`. The base URL comes from `VITE_API_URL` in `.env`.

```js
import api from './api/client';

const response = await api.get('/api/health');
```

## API endpoints

| Method | Path           | Description              | Middleware |
|--------|----------------|--------------------------|------------|
| GET    | `/api/health`  | API and database status  | None       |
| GET    | `/api`         | Welcome message          | Both       |

## License

Private — OMNICRM project.
