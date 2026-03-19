# AutoZap Multi-Tenancy (Control Plane + Tenant DB)

## 1) Arquitetura adotada

A plataforma foi separada em **duas camadas de dados**:

- **Control Plane DB** (`CONTROL_PLANE_DATABASE_URL`):
  - `GlobalUser`, `Company`, `CompanyMembership`
  - `TenantDatabase` (registry central dos bancos por empresa)
  - `TenantProvisioningJob`
  - `PlatformAuditLog`
  - `GlobalRefreshToken`, `GlobalPasswordResetToken`
- **Tenant DB (1 por empresa)**:
  - Domínio operacional da empresa (workspace, usuários internos, contatos, conversas, campanhas, etc.)
  - Mantido no schema de tenant (`backend/prisma/schema.prisma`)
  - Link com identidade global via `User.globalUserId`

## 2) Modelo de autenticação e autorização

- Login e refresh são resolvidos no **control plane**.
- JWT carrega contexto de membership (`companyId`, `membershipId`, `workspaceId`) e `platformRole` quando aplicável.
- O backend resolve o tenant em servidor:
  - `TenantContextGuard` + `TenantConnectionService`
  - Rotas comuns exigem membership ativa + tenant resolvido
  - Rotas de plataforma usam `@PlatformAdmin()` e exigem `platformRole=SUPER_ADMIN`
- O frontend **não decide isolamento**; sem `companyId` confiado do client.

## 3) Provisionamento de empresa

Fluxo (`TenantProvisioningService`):

1. Cria job de provisioning no control plane.
2. Registra/atualiza `TenantDatabase` com URL criptografada (`APP_ENCRYPTION_KEY`).
3. Estratégia de banco:
   - `TENANT_DATABASE_STRATEGY=dedicated` (padrão): cria DB por tenant e aplica migrations.
   - `TENANT_DATABASE_STRATEGY=shared` (fallback controlado).
4. Aplica migrations do tenant.
5. Garante `Workspace` + settings iniciais + admin inicial no tenant.
6. Marca `TenantDatabase` como `READY` e finaliza job.
7. Em falha: marca `FAILED` e registra erro.

## 4) Área admin da plataforma

Novos endpoints em `backend/src/modules/platform-admin` (`/api/platform-admin/*`):

- `GET /platform-admin/me`
- `GET /platform-admin/dashboard`
- `GET/POST/PATCH /platform-admin/companies`
- `POST /platform-admin/companies/:companyId/provision`
- `GET/POST/PATCH /platform-admin/users`
- `POST /platform-admin/users/:globalUserId/memberships`
- `GET /platform-admin/audit-logs`

Frontend novo:

- `frontend/app/(platform)/platform/layout.tsx`
- `frontend/app/(platform)/platform/page.tsx`
- `frontend/app/(platform)/platform/companies/page.tsx`
- `frontend/app/(platform)/platform/users/page.tsx`
- `frontend/app/(platform)/platform/audit/page.tsx`

## 5) Rodando localmente

### Variáveis mínimas

- `DATABASE_URL` (tenant local/fallback)
- `CONTROL_PLANE_DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `JWT_ACCESS_SECRET`
- `REDIS_URL`

### Ordem recomendada

1. Subir infra (Postgres/Redis).
2. Migrar control plane:
   - `npm run mt:migrate:control-plane --workspace backend`
3. Migrar tenant(s):
   - específico: `npm run mt:migrate:tenant --workspace backend -- --company <companyId>`
   - todos: `npm run mt:migrate:all-tenants --workspace backend`
4. Seed control plane (super admin):
   - `npm run mt:seed:control-plane --workspace backend`
5. (Legado) bootstrap de base existente:
   - `npm run mt:bootstrap:control-plane --workspace backend`

## 6) Migrations e seeds

- **Tenant schema**: `backend/prisma/schema.prisma`
- **Control plane schema**: `backend/prisma/control-plane/schema.prisma`
- Scripts de apoio:
  - `mt:migrate:control-plane`
  - `mt:migrate:tenant`
  - `mt:migrate:all-tenants`
  - `mt:seed:control-plane`
  - `mt:seed:tenant`
  - `mt:bootstrap:control-plane`

## 7) Deploy e rollback

### Deploy

1. Deploy backend com envs de control plane + tenant.
2. Rodar migrations do control plane.
3. Rodar migrations dos tenants (por lote ou individual).
4. Validar healthcheck e dashboard de provisioning.

### Rollback

1. Reverter aplicação para release anterior.
2. Em caso de migration incompatível, restaurar backup do control plane e do tenant afetado.
3. Reexecutar provisioning/migrations por tenant conforme necessário.

## 8) Backup e restore (estratégia)

- Backup do **control plane** e de **cada tenant DB** separadamente.
- Retenção e teste de restore por tenant.
- Recovery pode ser granular (empresa isolada) sem afetar os demais tenants.

## 9) Segurança aplicada

- Separação explícita entre rotas de plataforma e tenant.
- Resolução de tenant no servidor (guard + contexto assíncrono).
- JWT, rate limit e validação de DTOs.
- URLs de tenant criptografadas em `TenantDatabase.connectionUrlEncrypted`.
- Auditoria de ações sensíveis no control plane.

## 10) Riscos remanescentes e próximos passos

- Adicionar integração de secret manager para credenciais de tenant.
- Evoluir observabilidade por tenant (logs/metrics/traces com `companyId`).
- Expandir cobertura e2e (auth multiempresa, cross-tenant isolation, provisioning retries).
- Implementar política de rotação de credenciais de banco por tenant.
