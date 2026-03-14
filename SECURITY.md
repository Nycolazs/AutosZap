# AutosZap — Security Guide

Este documento descreve as medidas de segurança implementadas, práticas obrigatórias e riscos conhecidos.

---

## Medidas implementadas

### Backend

| Medida | Status | Detalhes |
|---|---|---|
| **Helmet** | ✅ | Headers de segurança HTTP (XSS-Protection, HSTS, etc.) via `helmet` |
| **CORS restrito** | ✅ | Apenas origens em `FRONTEND_URL` são permitidas em produção |
| **Rate limiting** | ✅ | Redis-backed, ativo em todas as rotas de auth (login, register, forgot/reset password) |
| **Validação de inputs** | ✅ | `ValidationPipe` com `whitelist: true` e `forbidNonWhitelisted: true` |
| **Body size limit** | ✅ | Limite de 2MB para JSON e URL-encoded |
| **JWT com secrets fortes** | ✅ | `assertProductionEnvironment()` recusa placeholders em produção |
| **Bcrypt** | ✅ | Senhas hasheadas com bcrypt (fator 10) |
| **Tokens opacos** | ✅ | Refresh tokens são hashed antes de armazenar |
| **Cookies httpOnly** | ✅ | Tokens de auth com `httpOnly` e `sameSite: lax` |
| **Swagger desabilitado** | ✅ | `SWAGGER_ENABLED=false` em produção por padrão |
| **Auditoria** | ✅ | Ações sensíveis geram `AuditLog` no banco |
| **Guards globais** | ✅ | JWT, Roles, Permissions e RateLimit aplicados globalmente |
| **Erros sem vazamento** | ✅ | `HttpExceptionFilter` controla o que é exposto nas respostas |

### Rate limits configurados

| Rota | Limite | Janela |
|---|---|---|
| `POST /api/auth/login` | 10 req | 60s por IP |
| `POST /api/auth/register` | 5 req | 3600s por IP |
| `POST /api/auth/refresh` | 20 req | 60s por IP |
| `POST /api/auth/forgot-password` | 5 req | 900s por IP |
| `POST /api/auth/reset-password` | 10 req | 900s por IP |

### Infraestrutura

| Medida | Status | Detalhes |
|---|---|---|
| **Postgres porta interna** | ✅ | Porta 5432 exposta apenas em `127.0.0.1` em produção |
| **Redis interno** | ✅ | Não exposto externamente (sem `ports` em `docker-compose.prod.yml`) |
| **TLS automático** | ✅ | Caddy gerencia HTTPS/TLS via ACME automaticamente |
| **Secrets no env** | ✅ | Nenhum secret hardcoded no código |
| **Validação de env** | ✅ | `assertProductionEnvironment()` valida na inicialização |
| **Scripts sensíveis no gitignore** | ✅ | `tmp-*.py`, `check-status.py` ignorados pelo Git |

### Frontend

| Medida | Status | Detalhes |
|---|---|---|
| **Proxy server-side** | ✅ | Todas as requests para o backend passam por Next.js API routes |
| **Cookies httpOnly** | ✅ | Tokens não acessíveis via `document.cookie` |
| **Auth middleware** | ✅ | Rotas protegidas verificam token server-side |

---

## Riscos conhecidos e pendências

### Médio risco

- **Refresh token rotation:** Tokens de refresh não são rotacionados a cada uso (one-time token). Considere implementar refresh token rotation para detectar roubo de token.
- **Password strength:** Não há validação de força de senha (comprimento mínimo, complexidade). Adicionar `zxcvbn` ou similar.
- **Audit log retention:** Logs de auditoria não têm política de retenção/purge — a tabela crescerá indefinidamente.
- **Rate limit por usuário:** O rate limit atual é por IP. Para APIs autenticadas, considere também limitar por `userId`.

### Baixo risco

- **CSRF:** A arquitetura usa `sameSite: lax` nos cookies + JWT em `Authorization` header para APIs. Aceitável para esta stack, mas documentar explicitamente o modelo de ameaça.
- **Logs no container:** Logs do Docker não têm rotação configurada. Configure `logging.options.max-size` no `docker-compose.prod.yml` se o sistema ficar em produção por muito tempo.
- **Dependências:** Algumas dependências de desenvolvimento podem ter vulnerabilidades. Execute `npm audit` periodicamente.

---

## Práticas obrigatórias de segurança

### Secrets e credenciais

- ❌ **Nunca** commitar arquivos `.env`, `.env.production`, ou qualquer arquivo com valores reais de credenciais
- ❌ **Nunca** hardcodar IPs, senhas ou tokens em scripts que vão para o repositório
- ❌ **Nunca** usar valores `change-me-*` em produção (o backend rejeita no startup)
- ✅ Rotacionar `JWT_ACCESS_SECRET` e `APP_ENCRYPTION_KEY` se houver suspeita de compromisso
- ✅ Usar senhas aleatórias de pelo menos 32 bytes (ex.: `openssl rand -hex 32`)

### Deploy

- ✅ Apenas o script `scripts/deploy/deploy.sh` deve fazer updates em produção
- ✅ Validar healthcheck após todo deploy
- ✅ Manter o `.env.production` com permissões `600` (só root lê)

### Banco de dados

- ✅ Backup regular do volume `postgres_data`
- ✅ Nunca expor a porta 5432 publicamente
- ✅ Usar usuário dedicado para o banco (não `postgres` super-user)

---

## Resposta a incidentes

### Token comprometido

1. Acesse o banco e invalide todos os refresh tokens do usuário afetado:
   ```sql
   DELETE FROM "RefreshToken" WHERE "userId" = '<id>';
   ```
2. Force logout forçado (o próximo `refresh` falhará).
3. Notifique o usuário.
4. Rotacione `JWT_ACCESS_SECRET` se o comprometimento for da chave secreta.

### Servidor comprometido

1. Suspenda o serviço: `docker compose -f docker-compose.prod.yml stop`
2. Rotacione TODAS as credenciais (`POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `APP_ENCRYPTION_KEY`, tokens Meta).
3. Reveja logs de auditoria: `SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 100;`
4. Restaure de backup limpo.

---

## Gerando secrets seguros

```bash
# Secret de 64 caracteres hex (32 bytes)
openssl rand -hex 32

# Para JWT_ACCESS_SECRET e APP_ENCRYPTION_KEY
openssl rand -base64 48
```
