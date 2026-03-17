# AutosZap - Agent Handoff Guide

This file is for coding agents working in this repository.

## 1) Monorepo Structure
- Frontend (Next.js): `frontend/`
- Backend (NestJS + Prisma): `backend/`
- Mobile: `apps/mobile/`
- Desktop: `apps/desktop/`
- Shared packages: `packages/`

## 2) Local Runbook (Linux)
Use these commands from repo root:

```bash
# Backend + infra
sg docker -c 'docker compose up -d --build'

# Frontend dev
cd frontend && npm install && npm run dev

# Health check backend
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/health
```

Important:
- If Docker permission fails, use `sg docker -c '...'`.
- Frontend local URL usually `http://localhost:3000`.
- Backend local URL usually `http://localhost:4000`.

## 3) Local DB vs Production DB Naming
- Local app DB name: `autoszap`
- Production DB name: `autozap`

When syncing dump from production, restore into local DB `autoszap` (not `autozap`).

## 4) Production Frontend Deploy (Vercel)
Frontend project is linked in `frontend/.vercel/project.json`.

Force deploy from CLI:

```bash
cd frontend
npx -y vercel deploy --prod --yes
```

Set main domain alias:

```bash
npx -y vercel alias set <deployment-url-or-id> autoszap.com
```

Current known production alias target was set via CLI during this workspace session.

## 5) Critical Vercel Settings
In Vercel project settings:
- Root Directory: `frontend`
- Framework Preset: Next.js
- Install Command: `npm install`
- Build Command: `npm run build`

Do not add a root `vercel.json` that breaks framework detection unless strictly needed and validated.

## 6) Backend Automation Behavior (Conversations)
File: `backend/src/modules/conversations/conversation-workflow.service.ts`

Behavior expected without any user logged in:
- Conversation in progress should return to `WAITING` after inactivity timeout.
- Conversation in `WAITING` should auto-close as `UNANSWERED` after waiting auto-close timeout.

Recent fix implemented:
- Commit: `e188e96`
- Timeout processing now uses fallback `statusChangedAt` when `waitingSince` is null.
- When returning to `WAITING`, service now sets `waitingSince` to current time.

## 7) Production Infra Notes
- Production domain: `autoszap.com`
- Production app stack includes VPS + Docker Compose under `/opt/autozap`.
- Backend is expected to run unattended jobs (no active user session required).

Do not store raw secrets in repository files. Use environment variables and secure secret storage.

## 8) Safe Operating Rules for Agents
- Never run destructive git commands (`reset --hard`, forced checkout) unless explicitly asked.
- If workspace is dirty, avoid reverting unrelated user changes.
- Prefer minimal patches.
- Validate with logs and database checks when changing automation logic.
