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
