# AutosZap — Deploy Guide

> **Padrão obrigatório:** O deploy deve ser feito EXCLUSIVAMENTE via Git.  
> Proibido: FTP, upload manual, edição direta de arquivos em produção, `scp`, `rsync` ad-hoc.

---

## Arquitetura de produção

| Componente | Responsável | Como é atualizado |
|---|---|---|
| **Backend API** | Docker Compose no servidor VPS | `scripts/deploy/deploy.sh` (git pull + rebuild) |
| **Frontend** | Vercel (deploy automático) | Push para branch `main` |
| **Banco de dados** | Docker Compose (Postgres) | Migrations automáticas no startup do backend |
| **Cache** | Docker Compose (Redis) | Stateful — não requer rebuild |
| **Reverse proxy** | Docker Compose (Caddy) | Automático via TLS / não precisa rebuild a cada deploy |

---

## Fluxo oficial de atualização

### Frontend (Vercel)

1. Faça suas alterações localmente.
2. Rode `npm run build --workspace frontend` para garantir que o build passa.
3. Commit e push para `main`:
   ```bash
   git add .
   git commit -m "feat: descrição clara da mudança"
   git push origin main
   ```
4. A Vercel detecta o push e faz deploy automático.
5. Valide em produção acessando o URL do frontend.

### Backend (VPS + Docker)

1. Commit e push do código para `main` (igual ao frontend).
2. Conecte-se ao servidor de produção via SSH:
   ```bash
   ssh root@<IP_DO_SERVIDOR>
   ```
3. Execute o script de deploy:
   ```bash
   cd /opt/autozap
   bash scripts/deploy/deploy.sh
   ```
4. O script faz automaticamente:
   - `git fetch` + `git reset --hard origin/main`
   - `docker compose build backend`
   - `docker compose up -d --no-deps backend`
   - Healthcheck automático (aguarda `/api/health` responder)
5. Valide com:
   ```bash
   bash scripts/ops/healthcheck.sh
   ```

---

## Checklist pré-deploy

- [ ] Build local do frontend passou: `npm run build --workspace frontend`
- [ ] TypeScript do backend sem erros: `npm run typecheck --workspace backend`
- [ ] Testes passando (quando existirem)
- [ ] Variáveis de ambiente verificadas: `bash scripts/ops/check-env.sh`
- [ ] Migrations novas testadas localmente antes
- [ ] Nenhuma credencial hardcoded no commit
- [ ] Código revisado e em `main`

---

## Checklist pós-deploy

- [ ] `bash scripts/ops/healthcheck.sh` retorna OK
- [ ] `curl https://api.autoszap.com/api/health` retorna `{"status":"ok"}`
- [ ] Frontend carrega corretamente
- [ ] Login funciona
- [ ] Nenhum erro crítico nos logs: `docker compose -f docker-compose.prod.yml logs --tail=50 backend`

---

## Configuração inicial do servidor (primeira vez)

```bash
# No servidor de produção
git clone git@github.com:Nycolazs/AutosZap.git /opt/autozap
cd /opt/autozap
cp .env.production.example .env.production
# Edite .env.production com os valores reais
nano .env.production
# Valide as variáveis
bash scripts/ops/check-env.sh
# Suba tudo
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## Comandos úteis

```bash
# Ver logs do backend em tempo real
docker compose -f docker-compose.prod.yml logs -f backend

# Ver status dos containers
docker compose -f docker-compose.prod.yml ps

# Reiniciar backend sem rebuild
bash scripts/ops/restart.sh backend

# Verificar saúde geral
bash scripts/ops/healthcheck.sh

# Verificar variáveis de ambiente
bash scripts/ops/check-env.sh
```

---

## Como fazer rollback

```bash
# No servidor de produção
cd /opt/autozap

# Ver commits disponíveis
git log --oneline -10

# Rollback para o commit anterior automaticamente
bash scripts/deploy/rollback.sh

# Rollback para um commit específico
bash scripts/deploy/rollback.sh abc1234
```

---

## Variáveis de ambiente

- **Arquivo template:** `.env.production.example` (commitado, sem valores reais)
- **Arquivo de produção:** `/opt/autozap/.env.production` (apenas no servidor, nunca no Git)
- **Frontend (Vercel):** variáveis configuradas no painel da Vercel

> Nunca commite `.env.production` ou qualquer arquivo `.env` com valores reais.

Variáveis obrigatórias para o backend iniciar em produção:

| Variável | Descrição |
|---|---|
| `FRONTEND_URL` | URL do frontend (usado para CORS) |
| `DATABASE_URL` | Connection string do Postgres |
| `REDIS_URL` | URL do Redis |
| `JWT_ACCESS_SECRET` | Secret JWT de acesso — mínimo 32 bytes aleatórios |
| `APP_ENCRYPTION_KEY` | Chave de criptografia — mínimo 32 bytes aleatórios |
| `POSTGRES_PASSWORD` | Senha do Postgres |
| `AUTOSZAP_BACKEND_HOST` | Hostname exposto pelo Caddy (ex.: `api.autoszap.com`) |

---

## Migrações de banco de dados

As migrations Prisma são aplicadas **automaticamente no startup** do container backend:

```
CMD ["sh", "-c", "npm run prisma:migrate:deploy && node dist/src/main.js"]
```

Para criar uma nova migration em desenvolvimento:
```bash
cd backend
npx prisma migrate dev --name nome-da-migration
```

---

## Práticas proibidas

- ❌ FTP para qualquer arquivo de produção
- ❌ Upload manual de arquivos via `scp`, SFTP, painel de hosting
- ❌ Editar código diretamente no servidor em produção
- ❌ Commitar `.env.production` ou qualquer `.env` com valores reais
- ❌ Commitar scripts com senhas ou tokens hardcoded
- ❌ Fazer `docker compose up` sem usar o `--env-file .env.production`
- ❌ Modificar arquivos no servidor sem depois refletir no Git
