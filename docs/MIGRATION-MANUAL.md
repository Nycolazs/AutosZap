# 🚀 Executar Migration na Produção

Devido a limitações da autenticação SSH interativa via terminal, execute a migration manualmente usando PuTTY ou outro cliente SSH.

## Opção 1: Usando PuTTY (Recomendado para Windows)

1. Abra o **PuTTY** ou **plink.exe**
2. Conecte ao servidor:
   - Host: `178.156.252.137`
   - User: `root`
   - Password: `2029`

3. Execute os comandos abaixo:

```bash
cd /opt/autozap
git pull origin main
cd backend
npx prisma migrate deploy
npx prisma migrate status
```

## Opção 2: Usando Terminal SSH (macOS/Linux)

```bash
ssh root@178.156.252.137
# Digite a senha: 2029

cd /opt/autozap
git pull origin main
cd backend
npx prisma migrate deploy
npx prisma migrate status
```

## Opção 3: Executar via Docker (Se SSH não funcionar)

```bash
# Conecte ao servidor via qualquer método
ssh root@178.156.252.137

# Execute migration dentro do container
docker exec autozap-backend-1 bash -c "cd /app && npx prisma migrate deploy"
```

## Opção 4: Usar Deploy Completo

Se quiser fazer um deploy completo (rebuild do container + migration):

```bash
ssh root@178.156.252.137
cd /opt/autozap
bash scripts/deploy/deploy.sh
```

## Verificar Status após Migration

```bash
docker exec autozap-backend-1 npx prisma migrate status
```

## Verificar se a API está respondendo

```bash
curl https://api.autoszap.com/api/health
```

Deve retornar: `{"status":"ok"}`

---

## Esperado após a migration

✅ Campos `positionX` e `positionY` adicionados à tabela `AutoResponseMenuNode`
✅ Menu interativo pode salvar posições dos nós
✅ API retorna 200 ok no health endpoint
