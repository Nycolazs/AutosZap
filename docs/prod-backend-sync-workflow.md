# Workflow: Frontend Local + Backend Producao + Sync para GitHub

Este fluxo foi criado para o time desenvolver com:

- frontend local;
- backend apontando para a API de producao;
- possibilidade de sincronizar alteracoes feitas diretamente na VPS para o GitHub.

## 1) Apontar frontend local para backend de producao

No root do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/use-prod-backend.ps1
```

Isso gera `frontend/.env.local` com:

```env
BACKEND_URL=https://api.autoszap.com
```

Depois:

```powershell
cd frontend
npm run dev
```

## 2) Fazer alteracoes diretamente no backend da VPS

Servidor:

- Host: `178.156.252.137`
- Path do projeto: `/opt/autozap`

## 3) Sincronizar alteracoes da VPS para GitHub

No seu computador local (repositorio limpo, sem mudancas pendentes):

```powershell
$env:AUTOSZAP_VPS_PASSWORD='SUA_SENHA'
powershell -ExecutionPolicy Bypass -File scripts/ops/sync-prod-backend-to-github.ps1 -CommitMessage "fix: descricao da correcao"
```

O script executa:

1. commit das mudancas pendentes em `backend/` na VPS;
2. fetch desse estado para o repositorio local;
3. fast-forward local;
4. push para `origin/main`;
5. deploy do backend novamente na VPS (para garantir estado limpo e versionado).

### Opcional: sincronizar sem redeploy final

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/sync-prod-backend-to-github.ps1 -SkipDeploy
```

## Observacoes importantes

- O script sincroniza **somente** mudancas em `backend/` feitas na VPS.
- Sempre execute com o repositorio local limpo (`git status` vazio).
- Evite manter senha em historico de shell. Prefira definir `AUTOSZAP_VPS_PASSWORD` somente durante a sessao.
