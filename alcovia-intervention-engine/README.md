# Alcovia Intervention Engine

Closed-loop intervention system that keeps Human (Mentor), Machine (Automation), and Student App in sync. The platform captures daily performance, triggers mentor workflows on failure, and enforces focus rules directly in the student UI.

## System Snapshot

-   **Frontend**: React web app (Expo-style experience) with focus timer, quiz input, and state-aware UI (normal, locked, remedial). Includes cheater detection (tab switch/minimize) and Socket.io updates.
-   **Backend**: Node.js + Express + PostgreSQL. Manages student state machine, logs daily performance, exposes mentor automation hooks, and bridges WebSocket events.
-   **Automation**: n8n workflow exports (`n8n_workflow/mentor-intervention-workflow.json`) for mentor alerts, approval loop, and auto-unlock fail-safe.

## Architecture

```
Student Browser ── REST / Socket.io ──► Backend API ── SQL ──► PostgreSQL
      │                                              │
      │◄────────── Socket Push ─── Mentor Decision ◄─┘
      │                                              \
      └─ Cheater Detection ─► /api/report-cheat ───►  n8n Webhook ─► Mentor Email/UI
```

### Key Flows

1. **Daily Success**: `/api/daily-checkin` logs success, keeps status `normal`.
2. **Performance Failure**: Backend flags `needs_intervention`, triggers n8n. Student app locks instantly through WebSocket.
3. **Mentor Action**: Mentor receives link, assigns task via n8n → `/api/assign-intervention`. Student UI switches to remedial state without refresh.
4. **Task Completion**: Student marks task done via `/api/complete-intervention`. Status returns to `normal`.
5. **Cheater Detection** _(bonus)_: Frontend detects tab switch/minimize during focus session, auto-fails via `/api/report-cheat`, notifies mentor, and locks student.

### Fail-Safe (Chaos Component)

-   Mentor response wait is capped (default 5 minutes in workflow). On timeout, n8n auto-calls `/api/assign-intervention` with an "Auto unlock" task so students are not stranded.
-   Production recommendation: escalate to a Head Mentor instead of auto-unlock, or chain additional reminders before fallback.

## Repository Layout

```
client/                 React web app (Focus Mode UI)
  src/
    App.js             Main interface + cheater detection
server/
  src/
    app.js             Express app + middleware
    index.js           HTTP + Socket.io bootstrap
    config/            Database (PostgreSQL) setup
    controllers/       Student state + intervention logic
    routes/            API surface mounted under /api
    services/          External integrations (n8n webhook trigger)
    utils/             Socket.io registry helper
  scripts/
    initDatabase.js    One-off schema bootstrapper
n8n_workflow/          Workflow JSON + setup guide
```

## Prerequisites

-   Node.js 18+
-   PostgreSQL 13+ (local Docker, Render, Neon, or Supabase)
-   n8n (cloud account or self-hosted)

## Environment Variables

Create `server/.env` based on `.env` template:

```
PORT=5000
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/mentor-notification
DATABASE_URL=postgres://username:password@host:5432/alcovia
PGSSLMODE=require
# Force the built-in pg-mem fallback while prototyping locally
USE_IN_MEMORY_DB=true
# Optional discrete credentials if not using DATABASE_URL
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=postgres
# DB_NAME=alcovia
CORS_ORIGIN=http://localhost:3000,https://your-deployed-client.com
```

For Supabase or other managed services, keep `PGSSLMODE=require` to allow SSL.

Create `client/.env` if you need to point to cloud deployments:

```
REACT_APP_API_URL=https://your-backend-host/api
REACT_APP_SOCKET_URL=https://your-backend-host
```

## Local Development

### Backend

```cmd
cd server
npm install
npm run init-db   # Creates tables and seed student in Postgres
npm run dev       # Start Express + Socket.io (nodemon)
```

If you haven't provisioned Postgres yet, keep `USE_IN_MEMORY_DB=true` (default); the server will boot with an in-memory Postgres (pg-mem) instance so you can demo the flow. Once you have a real Postgres/Supabase database, set `USE_IN_MEMORY_DB=false` and update `DATABASE_URL` accordingly.

### Frontend

```cmd
cd client
npm install
npm start
```

Open `http://localhost:3000`. Use the focus timer, submit check-ins, and trigger failures to see the lock/mentor loop.

### n8n Workflow

1. Import `n8n_workflow/mentor-intervention-workflow.json`.
2. Update email/slack node credentials.
3. Copy the generated webhook URLs into `N8N_WEBHOOK_URL` (failure trigger) and configure mentor action callbacks.
4. Activate the workflow. Mentor emails provide action buttons that hit `/assign-intervention` or auto-unlock endpoints.

## Deployment Playbook

### Backend (Render / Railway / Fly.io)

1. Provision a managed Postgres database; capture connection string.
2. Deploy the `server/` directory as a Node service.
    - Build command: `npm install`
    - Start command: `node src/index.js`
3. Set environment variables (`PORT`, `DATABASE_URL`, `N8N_WEBHOOK_URL`, `PGSSLMODE`, `CORS_ORIGIN`).
4. Whitelist the deployed backend URL in the client `.env`.

### Frontend (Vercel / Netlify)

1. Point deployment at `client/`.
2. Configure environment vars (`REACT_APP_API_URL`, `REACT_APP_SOCKET_URL`).
3. Ensure build command `npm run build` and output `build/`.

### n8n Cloud

-   Paste backend webhook URLs into the HTTP request nodes.
-   Update mentor notification channel (EmailJS, SendGrid, or Slack).
-   For production, expand the wait state with escalation steps (e.g., Slack DM at 10 minutes, auto unlock at 30).

## Testing the Loop

1. **Happy Path**: Focus for >60 mins (use dev tools to manipulate timer if needed), submit quiz >7 → expect `On Track` response.
2. **Failure Path**: Submit poor stats → student UI locks, mentor email fired.
3. **Mentor Unlock**: Click a remedial task link → student UI switches to remedial view instantly via WebSocket.
4. **Cheating**: Start timer then switch tabs → auto failure, `/api/report-cheat` triggers mentor workflow.

## Extensibility Notes

-   Swap PostgreSQL connection to Supabase by reusing the provided `DATABASE_URL` (SSL stays enabled).
-   Add authentication (Auth0/Supabase Auth) around `/api` endpoints for production hardening.
-   Plug additional analytics by extending `daily_logs` columns (e.g., mood, comments).
-   Integrate push notifications to students when mentors assign tasks.

## Troubleshooting

-   **CORS issues**: Ensure `CORS_ORIGIN` includes both `http://localhost:3000` and production domains, comma separated.
-   **Socket connection refused**: Confirm `REACT_APP_SOCKET_URL` matches deployed backend origin and that the environment allows WebSockets.
-   **n8n webhook 401**: Generate new webhook URLs after redeploying n8n; update `N8N_WEBHOOK_URL` accordingly.
-   **Mentor emails not arriving**: Check API keys for the Email/Slack node and examine n8n execution logs.

## License

MIT
