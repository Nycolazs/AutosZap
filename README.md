# AutosZap

SaaS dark premium em tons de azul para atendimento, CRM e automacao via WhatsApp Business Platform. O projeto agora foi estruturado como workspace com:

- `frontend/` para a versao web em Next.js
- `backend/` para a API NestJS
- `apps/mobile/` para o app Expo + React Native
- `apps/desktop/` para o app Electron de Windows e macOS
- `packages/platform-client/` e `packages/platform-types/` para o contrato compartilhado entre as plataformas

## Stack

- Frontend: Next.js 16, TypeScript, Tailwind CSS, componentes estilo shadcn/ui, React Query, Zustand, react-hook-form, zod, lucide-react, dnd-kit.
- Backend: NestJS 11, Prisma ORM, PostgreSQL, Redis, JWT com refresh token rotacionado, bcrypt, Swagger.
- Infra local: Docker Compose para PostgreSQL, Redis e backend containerizado.

## Estrutura

```text
apps/
  mobile/
  desktop/
packages/
  platform-client/
  platform-types/
frontend/
  app/
  components/
  lib/
  store/
backend/
  prisma/
  src/common/
  src/modules/
deploy/
  platform-releases.json
docker-compose.yml
```

## Variáveis de ambiente

1. Backend:
   Copie `backend/.env.example` para `backend/.env`.

2. Frontend:
   Copie `frontend/.env.example` para `frontend/.env.local`.

## Rodando localmente

1. Suba a infraestrutura e o backend:

```bash
docker compose up -d --build
```

2. Aplique schema Prisma e gere seed inicial:

```bash
docker compose exec backend npm run seed
```

3. Rode o frontend:

```bash
cd frontend
npm install
npm run dev
```

4. URLs principais:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:4000/api](http://localhost:4000/api)
- Swagger: [http://localhost:4000/docs](http://localhost:4000/docs)

## Rodando as novas plataformas

Instale a workspace completa na raiz:

```bash
npm install
```

### Web

```bash
npm run dev:web
```

### Backend

```bash
npm run dev:backend
```

### Mobile Expo

```bash
npm run dev:mobile
```

O app mobile usa `EXPO_PUBLIC_API_URL` em `apps/mobile/app.config.ts` e persiste sessao com `expo-secure-store`.

### Desktop Electron

```bash
npm run dev:desktop
```

O app desktop persiste sessao no `userData` do Electron, usa notificacoes locais do sistema operacional e consome SSE do backend para atualizacao de inbox e alertas.

## Área de desenvolvimento no app

Depois de autenticar, use [http://localhost:3000/app/desenvolvimento](http://localhost:3000/app/desenvolvimento) para:

- salvar a URL local do frontend e backend
- registrar a URL pública do túnel do backend local
- copiar o `verify token`
- apontar o webhook oficial da Meta para `local` ou `produção`
- testar a instância, sincronizar a WABA e validar rapidamente se o canal está pronto

Essa tela foi pensada para evitar edição manual toda vez que você alternar entre localhost e produção.

## Credenciais demo

- Email: `admin@autoszap.com`
- Senha: `123456`

## Distribuicao multiplataforma

### Manifesto publico de releases

- Fonte: `deploy/platform-releases.json`
- Endpoint publico: `GET /api/platform/releases`
- A tela de login consome esse manifesto para mostrar Android, Windows e macOS com versao, build e CTA de download.

Para trocar um build publicado, atualize o manifesto com:

- `platform`
- `version`
- `buildNumber`
- `channel`
- `url`
- `notes`
- `qrCodeUrl` quando fizer sentido no Android

### Atualizacoes mobile

O app Expo foi preparado para OTA via EAS Update:

```bash
npm run update:mobile:preview
npm run update:mobile:production
```

Build Android:

```bash
npm run release:mobile:android
```

Se a mudanca for somente JS/assets, prefira `eas update`. Se houver mudanca nativa, gere uma nova build.

### Atualizacoes desktop

Builds do Electron:

```bash
npm run release:desktop:win
npm run release:desktop:mac
```

Configure `DESKTOP_UPDATES_BASE_URL` para apontar para o feed HTTP das builds publicadas. O `electron-updater` verifica novas versoes no boot quando o app esta empacotado.

### Notificacoes

O backend agora suporta:

- registro de dispositivos em `POST /api/platform/devices/register`
- desligamento do dispositivo em `POST /api/platform/devices/unregister`
- stream em tempo real de notificacoes em `GET /api/notifications/stream`
- push Expo para lembretes e novas mensagens

Lembretes e mensagens inbound do cliente geram notificacoes para os vendedores elegiveis e abrem a conversa correta quando o usuario toca no alerta.

## Seed inicial incluída

- 1 workspace demo
- 1 admin + 2 usuários ativos + 1 convite pendente
- 20 contatos
- 8 conversas com mensagens e notas
- 10 leads distribuídos no pipeline
- 5 tags
- 3 listas e 3 grupos
- 3 campanhas
- 2 assistentes
- 2 bases de conhecimento com documentos
- 3 ferramentas de IA
- 2 instâncias
- eventos webhook simulados para dev

## Modo Meta: real x desenvolvimento

### Desenvolvimento

- Configure `META_MODE=DEV`.
- Se as credenciais Meta não estiverem preenchidas, envios e testes usam fallback controlado.
- O backend persiste mensagens outbound, status e eventos normalmente, mas sem chamada externa.

### Desenvolvimento local com envio e recebimento reais

Se você quer testar o app inteiro no localhost, inclusive receber e responder mensagens reais do WhatsApp:

1. No `backend/.env`, preencha as credenciais reais da Meta.
2. Defina:

```env
META_MODE=PRODUCTION
BACKEND_PUBLIC_URL=https://SEU-TUNEL.trycloudflare.com
```

3. Mantenha a instância em `/app/instancias` com `mode=PRODUCTION`.
4. Suba o backend local e o frontend local.
5. Exponha o backend com um túnel público, por exemplo:

```bash
cloudflared tunnel --url http://localhost:4000
```

6. Abra `/app/desenvolvimento`, salve a URL do túnel e clique em `Apontar Meta para local`.

Com isso, a Meta passa a enviar webhooks para seu backend local. Quando terminar os testes, volte na mesma tela e clique em `Apontar Meta para produção`.

### Produção / ambiente real

Preencha no backend:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `META_MODE=PRODUCTION`
- `BACKEND_PUBLIC_URL=https://api.seudominio.com`

Além disso:

- Crie uma instância em `/app/instancias` com `mode=PRODUCTION`.
- Configure o webhook Meta apontando para `GET/POST /api/webhooks/meta/whatsapp`.
- Use o `webhook verify token` correspondente à instância.
- O backend valida `X-Hub-Signature-256` quando houver `app secret` configurado.
- Use a tela de instâncias para executar `Testar`, `Sync Meta`, `Subscribe` e `Templates`.
- A troca da foto do perfil do WhatsApp Business usa o `App ID` da instância ou `META_APP_ID` no ambiente.
- O endpoint `POST /api/integrations/meta/whatsapp/send-template` já está pronto para envio com template aprovado.
- Em produção, mensagens de texto livres respeitam a janela de atendimento de 24 horas; fora dela, use template.

## Deploy em produção

### Backend em VPS

1. Copie `.env.production.example` para `.env.production`.
2. Preencha `FRONTEND_URL`, segredos JWT, `APP_ENCRYPTION_KEY` e variáveis da Meta.
3. Defina `AUTOSZAP_BACKEND_HOST` com um host HTTPS que resolva para a VPS. Exemplo sem domínio próprio: `178-156-252-137.sslip.io`.
4. Defina `BACKEND_PUBLIC_URL` com a URL pública definitiva da API. Exemplo: `https://api.autoszap.com`.
5. Em produção, preencha `REDIS_URL` e mantenha `SWAGGER_ENABLED=false`, a menos que você precise expor a documentação temporariamente.
5. Suba com:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend npm run seed
```

O `docker-compose.prod.yml` sobe PostgreSQL, Redis, backend e Caddy com HTTPS automático. O backend agora aplica `prisma migrate deploy` no boot, em vez de `prisma db push`, para manter o schema alinhado com as migrations versionadas.

### Frontend no Vercel

No projeto `frontend/`, publique com `BACKEND_URL` apontando para o backend HTTPS:

```bash
vercel deploy --prod --yes \
  -e BACKEND_URL=https://178-156-252-137.sslip.io \
  -e NEXT_PUBLIC_APP_NAME=AutosZap
```

`BACKEND_URL` e um valor correto para `NEXT_PUBLIC_APP_NAME` precisam existir no projeto do Vercel. Sem `BACKEND_URL`, o frontend server-side nao consegue falar com a API em producao.

Depois copie a URL final do Vercel e atualize `FRONTEND_URL` no `.env.production` da VPS com essa URL.

### Webhook da Meta

- Callback URL: `https://SEU_BACKEND/api/webhooks/meta/whatsapp`
- Verify token: o valor de `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Exemplo com `sslip.io`:

- Callback URL: `https://178-156-252-137.sslip.io/api/webhooks/meta/whatsapp`
- Verify token: o mesmo token configurado em `.env.production`

## Fluxos importantes já implementados

- Login, cadastro, refresh token, logout, forgot/reset password.
- Segregação multi-tenant por `workspaceId`.
- Inbox com conversas reais, envio de mensagens, notas, tags e atribuição.
- CRM Kanban com persistência em drag and drop.
- Disparos com campanha, público, envio e métricas.
- CRUDs para grupos, listas, contatos, tags, assistentes, bases, documentos, ferramentas, instâncias e equipe.
- Dashboard com métricas, notificações e atividade recente.

## Comandos úteis

Workspace:

```bash
npm run dev:web
npm run dev:backend
npm run dev:mobile
npm run dev:desktop
npm run build:web
npm run build:backend
npm run build:desktop
```

Backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run start:dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Mobile:

```bash
cd apps/mobile
npx expo-doctor
npx tsc --noEmit
```

Desktop:

```bash
cd apps/desktop
npm run build
npm run package
```

## Observações

- O container do backend faz `prisma:push` ao subir, mas não executa seed automaticamente para não sobrescrever dados já criados. Rode `npm run seed` manualmente quando quiser resetar o banco com os dados demo.
- O frontend usa um BFF em rotas `app/api/*` com cookies HTTP-only para guardar access/refresh tokens e fazer proxy seguro ao backend.
- A tela de login web agora inclui uma area de downloads dinamica baseada no manifesto de releases.
- O app mobile foi pensado para vendedores com foco em inbox, conversa, lembretes e push.
- O app desktop foi pensado para operacao continua com inbox em tela grande, conversa lateralizada e notificacoes do sistema.
- O visual replica a composição das referências em versão dark blue premium, sem reutilizar identidade original.
