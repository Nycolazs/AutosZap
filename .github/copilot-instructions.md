# Copilot Instructions for This Repository

Before making changes, read `AGENTS.md` at repository root.

Priority workflow for this repo:
1. Follow `AGENTS.md` for run/setup/deploy conventions.
2. Respect local vs production DB naming (`autoszap` local, `autozap` prod).
3. For frontend production deploys, use Vercel from `frontend/` directory.
4. For conversation automation issues, verify backend timeout workflow logic and database eligibility conditions.

When in doubt, prefer explicit verification:
- backend logs
- docker compose status
- direct SQL checks for conversation status/timeouts
