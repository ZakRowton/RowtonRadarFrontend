# RowtonRadarFrontend

Next.js frontend for the radar UI.

## Environment

Copy `.env.example` to `.env` and edit values as needed:

- `NEXT_PUBLIC_API_BASE`: public backend URL used by browser requests.
- `BACKEND_URL`: server-side backend URL used by Next route handlers/rewrites.

## Local Docker Run

```bash
cp .env.example .env
docker compose up --build -d
```

Frontend will be available at `http://localhost:3001`.

## Hostinger One-Click Docker Deployment

1. Push this repo to GitHub.
2. In Hostinger Docker Manager, create a new app from this repository.
3. Select `docker-compose.yml` from repo root.
4. Add env vars from `.env.example` in Hostinger (or upload a `.env` file).
5. Deploy.

## Useful Commands

```bash
npm install
npm run dev
npm run build
npm run start
```
