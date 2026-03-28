# WhatsApp Web QR Provider

AutosZap now supports two WhatsApp providers in parallel:

- `META_WHATSAPP`: official Meta WhatsApp Business Platform flow
- `WHATSAPP_WEB`: self-hosted QR login flow backed by the internal gateway app in `apps/whatsapp-web-gateway`

## Architecture

- `backend/` remains the source of truth for instances, contacts, conversations, messages, automation, notifications, and tenant isolation.
- `apps/whatsapp-web-gateway/` owns the WhatsApp Web browser session lifecycle, QR generation, reconnection, and event delivery.
- Backend and gateway communicate only over internal HTTP with a shared secret.
- Gateway session data is stored on a persistent volume mounted at `/data`.

## Local Run

1. Install workspace dependencies:

```bash
npm install
```

2. Start infra, backend, and the gateway:

```bash
docker compose up -d --build
```

3. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

4. Verify the two internal services:

```bash
curl -s http://localhost:4000/api/health
docker compose exec whatsapp-web-gateway node -e "fetch('http://127.0.0.1:3001/health').then(r=>r.text()).then(t=>console.log(t))"
```

If you run `backend` outside Docker with `npm run start:dev`, keep the gateway in Compose and point the backend to the loopback port exposed by the local compose file:

```bash
# backend/.env
WHATSAPP_WEB_GATEWAY_URL=http://127.0.0.1:3001
WHATSAPP_WEB_GATEWAY_SHARED_SECRET=autoszap-local-whatsapp-web-secret
BACKEND_INTERNAL_BASE_URL=http://127.0.0.1:4000
```

## Key Environment Variables

Backend:

- `WHATSAPP_WEB_GATEWAY_URL`
- `WHATSAPP_WEB_GATEWAY_SHARED_SECRET`
- `BACKEND_INTERNAL_BASE_URL`
- `WHATSAPP_WEB_GATEWAY_CALLBACK_URL` optional override
- `JSON_BODY_LIMIT`

Gateway:

- `GATEWAY_SHARED_SECRET`
- `BACKEND_CALLBACK_BASE_URL`
- `SESSION_DIR`
- `REGISTRY_FILE`
- `CHROMIUM_PATH`
- `HEADLESS`
- `CALLBACK_TIMEOUT_MS`
- `AUTO_RESTART_DELAY_MS`

The local compose files already provide sane defaults. In production, set a strong `WHATSAPP_WEB_GATEWAY_SHARED_SECRET`.

## Operator Flow

1. Open `/app/instancias`.
2. Click `Criar instancia QR`.
3. Open `Ver conexao`.
4. Click `Iniciar sessao` to request a QR.
5. Scan the QR with the WhatsApp mobile app.
6. Wait for the instance status to move to `Conectada`.

## Manual Smoke Checklist

- Existing Meta instance still syncs and its Meta-only actions remain available.
- A new `WHATSAPP_WEB` instance can be created from `/app/instancias`.
- `GET /api/instances/:id/connection-state` returns the QR/session phase for QR instances.
- `GET /api/instances/:id/qr` returns a QR payload while the session is awaiting scan.
- After scanning the QR, the instance becomes connected and stays connected after backend restart.
- After restarting `whatsapp-web-gateway`, the session is restored from `/data/sessions`.
- Outbound text from AutosZap is sent through the QR instance.
- Inbound text creates or updates contact, conversation, and message records in the same pipeline used by the inbox.
- Common media messages can be sent and received through the QR instance.
- `disconnect`, `reconnect`, and `logout` behave only for `WHATSAPP_WEB` instances.
- Meta-only features such as templates and business profile actions remain blocked for QR instances.
- QR-provider messages do not enforce Meta's 24-hour template restriction.

## Notes

- In local development, the gateway is bound to `127.0.0.1:3001` so a backend running outside Docker can still reach it without exposing the service publicly on the LAN.
- In production, keep the gateway private inside Compose and do not publish its port on the host.
- Gateway callbacks are signed per instance with an HMAC derived from the shared secret and `instanceId`.
