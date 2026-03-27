# WhatsApp Web Gateway

Internal AutosZap service for QR-based WhatsApp Web sessions.

## Run locally

From the repo root:

```bash
npm install
npm run dev --workspace @autoszap/whatsapp-web-gateway
```

## Environment

- `PORT` default `3001`
- `BIND_HOST` default `0.0.0.0`
- `GATEWAY_SHARED_SECRET` required for internal API auth
- `BACKEND_CALLBACK_BASE_URL` required for event callbacks
- `SESSION_DIR` default `/data/sessions`
- `REGISTRY_FILE` default `/data/registry.json`
- `CHROMIUM_PATH` optional explicit Chromium binary path

## Internal endpoints

- `GET /health`
- `GET /healthz`
- `GET /instances`
- `POST /instances`
- `GET /instances/:instanceId`
- `GET /instances/:instanceId/state`
- `GET /instances/:instanceId/connection-state`
- `GET /instances/:instanceId/qr`
- `POST /instances/:instanceId/start`
- `POST /instances/:instanceId/connect`
- `POST /instances/:instanceId/reconnect`
- `POST /instances/:instanceId/disconnect`
- `POST /instances/:instanceId/logout`
- `POST /instances/:instanceId/qr/refresh`
- `POST /instances/:instanceId/send/text`
- `POST /instances/:instanceId/send/media`

All non-health endpoints require `x-autoszap-internal-secret`.

## Callback events

The gateway signs backend callbacks with `x-autoszap-event-signature` using a per-instance secret derived from `GATEWAY_SHARED_SECRET` and `instanceId`.

- `qr.updated`
- `session.ready`
- `session.connected`
- `session.disconnected`
- `auth.failure`
- `message.inbound`
- `message.status`
