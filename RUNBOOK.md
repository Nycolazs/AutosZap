# AutosZap — Runbook de Operações

Guia prático para operação, manutenção e resolução de incidentes.  
Leia também: [DEPLOY.md](DEPLOY.md) e [SECURITY.md](SECURITY.md).

---

## Acessando o servidor de produção

```bash
ssh root@<IP_DO_SERVIDOR>
cd /opt/autozap
```

> **Importante:** Não edite arquivos diretamente no servidor. Faça as mudanças no repositório e use `deploy.sh`.

---

## Status geral

```bash
# Verificação completa de saúde
bash scripts/ops/healthcheck.sh

# Status dos containers
docker compose -f docker-compose.prod.yml ps

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f backend

# Commit no servidor
git log --oneline -3
```

---

## Deploy em produção

Veja o guia completo em [DEPLOY.md](DEPLOY.md). Resumo rápido:

```bash
cd /opt/autozap
bash scripts/deploy/deploy.sh
```

---

## Rollback

```bash
# Rollback para o commit anterior
bash scripts/deploy/rollback.sh

# Rollback para commit específico
bash scripts/deploy/rollback.sh abc1234
```

---

## Reiniciar serviços

```bash
# Reiniciar apenas o backend
bash scripts/ops/restart.sh backend

# Reiniciar tudo
bash scripts/ops/restart.sh all

# Via docker compose diretamente
docker compose -f docker-compose.prod.yml restart backend
```

---

## Logs e diagnóstico

```bash
# Logs do backend (últimas 100 linhas)
docker compose -f docker-compose.prod.yml logs --tail=100 backend

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f backend

# Inspeção de container
docker inspect autozap-backend-prod 2>/dev/null || docker ps --filter name=backend

# Uso de recursos
docker stats --no-stream

# Espaço em disco
df -h
du -sh /var/lib/docker/volumes/
```

---

## Banco de dados

```bash
# Conectar ao Postgres
docker compose -f docker-compose.prod.yml exec postgres psql -U autoszap -d autoszap

# Backup manual
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U autoszap autoszap > backup-$(date +%Y%m%d).sql

# Verificar migrations aplicadas
docker compose -f docker-compose.prod.yml exec backend \
  npx prisma migrate status
```

---

## Variáveis de ambiente

```bash
# Verificar variáveis obrigatórias
bash scripts/ops/check-env.sh

# Editar .env.production (use com cuidado)
nano /opt/autozap/.env.production

# Após editar, restart o backend para aplicar
bash scripts/ops/restart.sh backend
```

---

## Erros comuns e soluções

### Backend não sobe após deploy

```bash
# Ver últimos logs de erro
docker compose -f docker-compose.prod.yml logs --tail=50 backend

# Causas comuns:
# 1. Variável de ambiente faltando → bash scripts/ops/check-env.sh
# 2. Erro de migration → docker compose logs backend | grep "migration"
# 3. Postgres não pronto → docker compose ps postgres
```

### Banco de dados não conecta

```bash
# Verificar se postgres está rodando
docker compose -f docker-compose.prod.yml ps postgres

# Ver logs do postgres
docker compose -f docker-compose.prod.yml logs --tail=30 postgres

# Reconectar (reiniciar backend)
bash scripts/ops/restart.sh backend
```

### Erro de CORS no frontend

1. Verifique se `FRONTEND_URL` em `.env.production` contém o URL exato do frontend (sem barra no final).
2. Reinicie o backend após corrigir.
3. Teste: `curl -H "Origin: https://seu-frontend.com" https://api.autoszap.com/api/health`

### Memória/CPU alta

```bash
# Verificar consumo
docker stats --no-stream

# Reiniciar serviço específico
bash scripts/ops/restart.sh backend

# Se Redis estiver alto, verificar keys expiradas
docker compose -f docker-compose.prod.yml exec redis redis-cli info memory
```

### SSL/TLS expirado

- O Caddy renova TLS automaticamente via ACME (Let's Encrypt).
- Se falhar, verifique os logs do Caddy:
  ```bash
  docker compose -f docker-compose.prod.yml logs caddy
  ```

### Limite de rate limit atingido (429)

Isso é comportamento esperado para proteção contra abuso. Se for um usuário legítimo:
```bash
# Ver keys de rate limit no Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli keys "rl:*"

# Limpar key específica (substituir pela chave real)
docker compose -f docker-compose.prod.yml exec redis redis-cli del "rl:POST:/api/auth/login:1.2.3.4"
```

---

## Configuração inicial do servidor (onboarding)

```bash
# 1. Instalar Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# 2. Clonar o repositório
git clone git@github.com:Nycolazs/AutosZap.git /opt/autozap

# 3. Configurar variáveis de ambiente
cd /opt/autozap
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production   # Preencher com valores reais

# 4. Validar variáveis
bash scripts/ops/check-env.sh

# 5. Subir tudo
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 6. Aguardar e verificar
sleep 30
bash scripts/ops/healthcheck.sh
```

---

## Manutenção preventiva

### Semanal
- [ ] `bash scripts/ops/healthcheck.sh`
- [ ] Verificar uso de disco: `df -h`
- [ ] Verificar erros nos logs: `docker compose -f docker-compose.prod.yml logs --tail=200 backend | grep -i error`

### Mensal
- [ ] Backup do banco de dados
- [ ] `npm audit` nos repositórios locais para checar vulnerabilidades
- [ ] Rotacionar secrets se necessário
- [ ] Avaliar update de imagens Docker base (`postgres:16-alpine`, `redis:7-alpine`)

---

## Responsáveis e contatos

- Repositório: https://github.com/Nycolazs/AutosZap
- Suporte técnico: suporte@autoszap.com
- Documentação de deploy: [DEPLOY.md](DEPLOY.md)
- Documentação de segurança: [SECURITY.md](SECURITY.md)
