# Runbook: Migration de posições do Menu Interativo

Use este documento quando o menu interativo falhar ao salvar nós com erro de banco, normalmente por ausência da migration que adiciona `positionX` e `positionY` em `AutoResponseMenuNode`.

## Sintoma

Ao salvar o menu interativo, a interface retorna algo como:

```text
Não foi possível concluir a operação no banco de dados.
```

## Causa provável

A migration abaixo ainda não foi aplicada no schema tenant usado pela empresa:

- `backend/prisma/migrations/20260323120000_add_position_to_menu_nodes/migration.sql`

Alteração:

- adiciona `positionX` e `positionY` (`DOUBLE PRECISION`) em `AutoResponseMenuNode`

## Procedimento recomendado em produção

Como a plataforma é multi-tenant, o caminho seguro não é aplicar `prisma migrate deploy` apenas contra um `DATABASE_URL` isolado. O padrão atual é migrar os tenants via scripts de multitenancy do backend.

### Opção A: migrar todos os tenants `READY`

No servidor de produção:

```bash
ssh root@<SERVER_IP>
cd /opt/autozap/backend
npm run mt:migrate:all-tenants
```

### Opção B: migrar apenas um tenant específico

Use esta opção quando o problema estiver restrito a uma empresa conhecida:

```bash
ssh root@<SERVER_IP>
cd /opt/autozap/backend
npm run mt:migrate:tenant -- --company <COMPANY_ID>
```

### Opção C: ambiente legado ou banco compartilhado

Se o ambiente ainda estiver operando em modo antigo ou em fallback compartilhado, existe o helper:

```bash
ssh root@<SERVER_IP>
cd /opt/autozap
bash scripts/deploy/apply-migration.sh
```

Use esse caminho apenas quando tiver certeza de que a correção depende de uma única `DATABASE_URL`.

## Verificações após a migration

```bash
curl -sS https://api.autoszap.com/api/health
```

Depois valide na aplicação:

1. Abrir `/app/menu-interativo`.
2. Mover pelo menos um nó no canvas.
3. Salvar o menu.
4. Recarregar a tela e confirmar que a posição persistiu.

## Referências técnicas

Arquivos relacionados:

- `backend/prisma/schema.prisma`
- `backend/src/modules/auto-response-menus/auto-response-menus.controller.ts`
- `backend/src/modules/auto-response-menus/auto-response-menus.service.ts`
- `frontend/app/(app)/app/menu-interativo/_components/flow-canvas.tsx`
- `frontend/app/(app)/app/menu-interativo/_lib/types.ts`
- `frontend/app/(app)/app/menu-interativo/page.tsx`

Scripts úteis:

- `backend/scripts/multitenancy/migrate-all-tenants.ts`
- `backend/scripts/multitenancy/migrate-tenant.ts`
- `scripts/deploy/apply-migration.sh`

## Observações importantes

- O `scripts/deploy/deploy.sh` não executa migrations automaticamente.
- Se houver múltiplos tenants dedicados, aplicar migration em apenas um banco não resolve o problema de forma global.
- Se o erro persistir depois da migration, valide também a presença da coluna `type` em `AutoResponseMenuNode`, adicionada no hotfix `20260323223000_add_type_to_auto_response_menu_node`.
