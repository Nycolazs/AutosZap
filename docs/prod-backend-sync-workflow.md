# Workflow de contingência: Frontend Local + Backend de Produção + Sync da VPS

Este fluxo existe para cenários de contingência, investigação ou hotfix.

Use quando for realmente necessário:

- rodar o frontend local contra a API de produção;
- inspecionar comportamento real sem subir backend local;
- resgatar uma correção aplicada diretamente na VPS e sincronizá-la para o GitHub.

Não trate este workflow como fluxo padrão de desenvolvimento. O caminho preferencial continua sendo:

1. alterar localmente;
2. versionar no GitHub;
3. publicar com o procedimento oficial de deploy.

## 1) Apontar frontend local para o backend de produção

No root do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/use-prod-backend.ps1 -BackendUrl "https://api.autoszap.com"
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

## 2) Fazer alterações diretamente na VPS

Projeto esperado no servidor:

- path: `/opt/autozap`

O endereço/IP do servidor não deve ser documentado em Markdown versionado. Passe-o explicitamente ao script quando necessário.

## 3) Sincronizar alterações da VPS para o GitHub

No seu computador local, com repositório limpo:

```powershell
$env:AUTOSZAP_VPS_PASSWORD='SUA_SENHA'
powershell -ExecutionPolicy Bypass -File scripts/ops/sync-prod-backend-to-github.ps1 `
  -ServerIp "<SERVER_IP>" `
  -ServerUser "root" `
  -ServerPath "/opt/autozap" `
  -CommitMessage "fix: descricao da correcao"
```

O script executa:

1. commit das mudanças pendentes em `backend/` na VPS;
2. fetch desse estado para o repositório local;
3. fast-forward local;
4. push para `origin/main`;
5. deploy do backend novamente na VPS, a menos que `-SkipDeploy` seja informado.

### Opcional: sincronizar sem redeploy final

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/sync-prod-backend-to-github.ps1 `
  -ServerIp "<SERVER_IP>" `
  -SkipDeploy
```

## Limitações e cuidados

- O script sincroniza somente mudanças em `backend/` feitas na VPS.
- Exija `git status` local limpo antes da execução.
- Evite manter senha em histórico de shell. Prefira definir `AUTOSZAP_VPS_PASSWORD` só durante a sessão.
- Alterações diretas na VPS devem ser tratadas como exceção operacional, não como processo normal de desenvolvimento.
- Depois da sincronização, valide o backend com `bash scripts/ops/healthcheck.sh` e `https://api.autoszap.com/api/health`.
