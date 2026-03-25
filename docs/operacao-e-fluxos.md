# Operação e Fluxos do AutosZap

## 1. Modos de execução local

O repositório suporta três formas principais de trabalho local.

### 1.1 Stack local com Docker Compose

Sobe Postgres, Redis e backend containerizado:

```bash
sg docker -c 'docker compose up -d --build'
```

Depois disso:

```bash
cd frontend
npm install
npm run dev
```

Healthcheck:

```bash
curl -sS http://localhost:4000/api/health
```

### 1.2 Infra em Docker + app no host

Script operacional:

```bash
bash scripts/ops/start-local.sh
```

Esse fluxo:

- sobe Postgres e Redis via Docker;
- instala dependências se necessário;
- roda backend e frontend no host;
- grava logs em `.logs/local`;
- grava PIDs em `.pids`.

### 1.3 Workspaces por aplicativo

Da raiz:

```bash
npm run dev:web
npm run dev:backend
npm run dev:mobile
npm run dev:desktop
```

## 2. Pré-requisitos e observações locais

- Banco local padrão da aplicação: `autoszap`
- Nome de produção citado nos procedimentos: `autozap`
- Frontend local usual: `http://localhost:3000`
- Backend local usual: `http://localhost:4000`
- Swagger local: `http://localhost:4000/docs`
- O frontend declara `node >=24 <26`
- O repositório não traz `.env.example` ativos; a referência imediata para envs está no código, no `docker-compose` e nos scripts

## 3. Matriz de variáveis de ambiente

## 3.1 Backend

| Variável | Uso |
| --- | --- |
| `NODE_ENV` | habilita regras de produção, CORS e Swagger |
| `PORT` | porta HTTP da API |
| `FRONTEND_URL` | whitelist de origens para CORS |
| `BACKEND_PUBLIC_URL` | URLs públicas, docs operacionais e callbacks |
| `CONTROL_PLANE_DATABASE_URL` | banco global da plataforma |
| `DATABASE_URL` | banco tenant local/fallback |
| `REDIS_URL` | Redis para cache, locks e rate limit |
| `JWT_ACCESS_SECRET` | assinatura do JWT |
| `JWT_ACCESS_EXPIRES_IN` | expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | expiração lógica do refresh token |
| `APP_ENCRYPTION_KEY` | criptografia de segredos sensíveis |
| `ALLOW_PUBLIC_SIGNUP` | libera ou bloqueia cadastro público |
| `SWAGGER_ENABLED` | override da exposição do Swagger |
| `TENANT_DATABASE_STRATEGY` | `dedicated` ou estratégia alternativa controlada |
| `TENANT_DATABASE_BASE_URL` | base para criação de tenant DB |
| `TENANT_DATABASE_ADMIN_URL` | conexão administrativa para criação/migração de banco |
| `TENANT_DATABASE_PREFIX` | prefixo dos bancos tenant |
| `TENANT_ALLOW_SHARED_FALLBACK` | fallback para banco compartilhado |
| `META_MODE` | modo da integração Meta |
| `META_GRAPH_API_VERSION` | versão da Graph API |
| `META_WHATSAPP_ACCESS_TOKEN` | credencial da Meta |
| `META_WHATSAPP_PHONE_NUMBER_ID` | phone number id padrão |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | validação de webhook |
| `META_APP_ID` | app id da Meta |
| `META_APP_SECRET` | segredo do app da Meta |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | configuração de embedded signup |
| `EXPO_ACCESS_TOKEN` | autorização opcional para Expo Push |
| `PLATFORM_RELEASES_MANIFEST_PATH` | caminho do manifesto de releases |
| `GITHUB_RELEASES_TOKEN` | token para baixar asset Windows do GitHub |
| `GITHUB_RELEASES_REPO` | repositório do release Windows |
| `GITHUB_WINDOWS_ASSET_NAME` | nome do asset Windows |

## 3.2 Frontend web

| Variável | Uso |
| --- | --- |
| `BACKEND_URL` | URL base do backend usada pelos route handlers locais |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | metadata SEO |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | login social no cliente |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | login social no cliente |

## 3.3 Mobile

| Variável | Uso |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | URL base da API para o app |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | projeto EAS/Updates |
| `APP_VERSION` | versão publicada |
| `APP_BUILD_NUMBER` | build number Android/iOS |

## 3.4 Desktop

| Variável | Uso |
| --- | --- |
| `VITE_API_URL` | URL base da API no renderer local |
| `DESKTOP_WEB_URL` | URL aberta pelo shell Electron |
| `DESKTOP_DEBUG` | logs adicionais no processo main |

## 4. Fluxos end-to-end do produto

## 4.1 Cadastro público e provisioning de empresa

1. Usuário entra em `/register` e escolhe criar uma nova empresa.
2. Frontend chama `POST /api/auth/register`.
3. Backend valida termos, cria `Company`, `GlobalUser` e `CompanyMembership` no control plane.
4. `TenantProvisioningService` cria ou prepara o tenant DB, roda migrations e garante o `Workspace`.
5. A sessão é emitida e o usuário já entra como admin do tenant.

Resultado esperado:

- empresa criada no control plane;
- tenant em estado `READY`;
- admin inicial apto a acessar `/app`.

## 4.2 Entrada por convite

1. Admin gera um `CompanyInviteCode`.
2. Usuário entra em `/register`, escolhe entrar em empresa existente e valida o código.
3. Backend cria ou reativa `GlobalUser`, associa membership e atualiza o tenant correspondente.
4. A sessão já nasce no contexto da empresa convidante.

## 4.3 Onboarding do WhatsApp

O sistema suporta dois caminhos:

- configuração manual de instância;
- embedded signup da Meta.

Fluxo resumido:

1. Usuário acessa `/app/instancias`.
2. Frontend abre o bridge de embedded signup.
3. Callback entrega `code`, `phoneNumberId` e `wabaId`.
4. Backend troca código por token, cria ou atualiza `Instance`, sincroniza templates e perfil.
5. A instância pode ser testada, sincronizada e marcada como conectada.

## 4.4 Recebimento inbound e abertura de conversa

1. Meta envia webhook para `GET|POST /api/webhooks/meta/whatsapp`.
2. Backend valida o request e resolve o tenant pela instância.
3. A mensagem inbound gera ou atualiza `Conversation`, `ConversationMessage`, eventos e contadores.
4. O backend dispara SSE para o inbox.
5. Usuários elegíveis recebem notificação interna; no mobile podem receber push Expo.

## 4.5 Atendimento humano

1. Operador abre a conversa em `/app/inbox`, mobile ou desktop.
2. O sistema verifica visibilidade por papel e dono da conversa.
3. Ao responder manualmente, o workflow pode assumir a conversa para o agente e movê-la para `IN_PROGRESS`.
4. O operador pode enviar texto, mídia, notas, mensagens rápidas e lembretes.
5. Ao final, resolve, fecha ou reabre conforme permissão.

Estados normalizados principais:

- `NEW`
- `IN_PROGRESS`
- `WAITING`
- `RESOLVED`
- `CLOSED`

## 4.6 WAITING, timeout e auto-close

Comportamento esperado sem usuário ativo:

- conversa em andamento volta para `WAITING` após timeout de inatividade;
- conversa em `WAITING` pode auto-encerrar como `UNANSWERED`.

Estado atual importante do código:

- o processamento usa `statusChangedAt` como fallback quando `waitingSince` é nulo;
- ao voltar para `WAITING`, o serviço atualiza `waitingSince`.

## 4.7 Notificações cross-platform

### Web

- SSE em `/api/notifications/stream`
- atualização da lista de notificações e do estado do inbox

### Mobile

- registro em `/api/platform/devices/register`
- push via Expo
- deep link para a conversa ao tocar no alerta

### Desktop

- SSE para notificações
- bridge nativa `window.autoszapDesktop.notify`
- foco da janela e seleção da conversa no clique

## 4.8 Suporte e control plane

Há dois canais diferentes:

- comercial:
  `POST /api/platform/lead-interests`
- suporte:
  `POST /api/platform/support-tickets` e gestão em `/platform/suporte`

O admin global usa `/platform/*` para:

- visualizar empresas;
- provisionar tenants;
- gerenciar usuários globais;
- acompanhar auditoria;
- responder tickets;
- acompanhar interessados.

## 5. Deploy e release

## 5.1 Backend em produção

Fluxo oficial no VPS:

```bash
ssh root@<SERVER_IP>
cd /opt/autozap
bash scripts/deploy/deploy.sh
```

Validação pós-deploy:

```bash
bash scripts/ops/healthcheck.sh
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl -sS https://api.autoszap.com/api/health
```

Observações:

- o script atual faz `git fetch`, `git reset --hard origin/<branch>`, build e restart do backend;
- ele não executa migrations automaticamente;
- em produção, prefira o healthcheck público e o status de health do container.

## 5.2 Frontend web

Estado atual do repositório:

- `frontend/vercel.json` existe;
- `framework` está `null`;
- `buildCommand` é `npm run build:vercel`;
- o runtime local padrão continua sendo vinext/Vite.

Comandos usuais:

```bash
cd frontend
npm run dev
npm run build
npm run build:vercel
```

Nota operacional:

- o `AGENTS.md` menciona um `.vercel/project.json` e settings de projeto que não estão presentes no workspace atual;
- para documentação interna, o arquivo de referência efetivamente versionado é `frontend/vercel.json`.

## 5.3 Mobile

Comandos relevantes:

```bash
npm run dev:mobile
npm run release:mobile:android
npm run update:mobile:preview
npm run update:mobile:production
```

Regras práticas:

- mudança só de JS/assets: prefira `eas update`;
- mudança nativa: gere nova build;
- confirme `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, `APP_VERSION` e `APP_BUILD_NUMBER`.

## 5.4 Desktop

Comandos relevantes:

```bash
npm run dev:desktop
npm run release:desktop:linux
npm run release:desktop:mac
npm run release:desktop:win
npm run release:desktop:all
```

Notas:

- o modo principal é shell web;
- o fallback local é útil, mas não representa toda a superfície da web;
- o feed de updates e os artefatos compilados devem ser revisados em conjunto antes de um pipeline formal de auto-update.

## 5.5 Manifesto de releases

Fonte:

- `deploy/platform-releases.json`

Responsabilidade:

- publicar artefatos e metadados de Android, Windows e macOS;
- alimentar `GET /api/platform/releases`;
- servir a tela de downloads nas superfícies cliente.

Ao atualizar um release, mantenha:

- `platform`
- `version`
- `buildNumber`
- `channel`
- `url`
- `notes`
- `updatedAt`
- `qrCodeUrl` quando necessário

## 6. Checklist operacional

### Antes de subir localmente

- confirmar Docker disponível;
- confirmar portas `3000`, `4000`, `5432` e `6379` livres;
- confirmar URLs públicas e chaves Meta se o objetivo for testar integração real.

### Antes de deploy backend

- revisar `.env.production`;
- garantir backup e plano de rollback;
- validar necessidade de migrations do control plane e tenants;
- confirmar health endpoint público esperado.

### Depois de deploy

- validar `docker compose ps`;
- validar `https://api.autoszap.com/api/health`;
- validar logs do backend;
- validar pelo menos um fluxo de login e uma rota autenticada.

## 7. Riscos e inconsistências conhecidas

- Não há `.env.example` versionado para backend e frontend.
- A documentação legada contém instruções conflitantes de Vercel e infraestrutura.
- O desktop em dev usa shell com URL padrão diferente da porta do renderer local.
- O mobile trata apenas `login` como rota pública no gate principal, embora existam telas de cadastro e recuperação.
- O backend usa automações in-process; isso simplifica a arquitetura, mas reduz isolamento operacional.
- A resolução de tenant para webhook da Meta ainda precisa de um registry mais direto.

## 8. Recomendações de governança documental

- Usar `docs/README.md` como índice principal.
- Tratar `docs/arquitetura-da-plataforma.md` como visão estrutural de referência.
- Tratar este documento como manual operacional.
- Manter docs especializados para assuntos profundos, como multi-tenancy e release mobile.
- Não registrar IPs, senhas, tokens ou segredos em Markdown versionado.
