# Fix para erro de banco de dados no Menu Interativo

## Problema
Ao salvar o menu interativo, você recebe: "Não foi possível concluir a operação no banco de dados."

## Causa
A migration do banco de dados para adicionar os campos `positionX` e `positionY` ainda não foi aplicada na produção.

## Solução
Execute os seguintes comandos no VPS de produção:

```bash
# 1. Conectar ao VPS
ssh root@178.156.252.137

# 2. Aplicar a migration
cd /opt/autozap
bash scripts/deploy/apply-migration.sh

# 3. Verificar status das migrations
cd backend
npx prisma migrate status

# 4. Se necessário, forçar deploy completo
cd /opt/autozap
bash scripts/deploy/deploy.sh
```

## Detalhes Técnicos

### Migration criada
- **Arquivo**: `backend/prisma/migrations/20260323120000_add_position_to_menu_nodes/migration.sql`
- **Alteração**: Adiciona colunas `positionX` e `positionY` (DOUBLE PRECISION) à tabela `AutoResponseMenuNode`
- **Commit**: `0bf1406`

### Arquivos atualizados
1. **Backend**:
   - `backend/prisma/schema.prisma` - Schema com novos campos
   - `backend/src/modules/auto-response-menus/auto-response-menus.controller.ts` - Validações de DTO
   - `backend/src/modules/auto-response-menus/auto-response-menus.service.ts` - Tipos de entrada

2. **Frontend**:
   - `frontend/app/(app)/app/menu-interativo/_components/flow-canvas.tsx` - Canvas com persistência de posições
   - `frontend/app/(app)/app/menu-interativo/_lib/types.ts` - Tipos do menu
   - `frontend/app/(app)/app/menu-interativo/page.tsx` - Página principal

## Status
- ✅ Migration criada e commitada
- ✅ Backend rebuildar com novos campos
- ⏳ **Aguardando**: Aplicação da migration no banco de dados de produção
- ⏳ **Aguardando**: Confirmação de persistência de posições no canvas

## Rollback (se necessário)
Se for necessário reverter a migration:
```bash
cd /opt/autozap/backend
npx prisma migrate resolve --rolled-back 20260323120000_add_position_to_menu_nodes
```
