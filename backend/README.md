# AutosZap Backend

Backend NestJS + Prisma com arquitetura multi-tenant:

- **Control Plane DB** (identidade global, empresas, memberships, auditoria)
- **Tenant DB por empresa** (dados operacionais da empresa)

## Arquivos-chave

- Tenant schema: `prisma/schema.prisma`
- Control plane schema: `prisma/control-plane/schema.prisma`
- Guard de contexto tenant: `src/common/guards/tenant-context.guard.ts`
- Resolver de conexões tenant: `src/common/tenancy/tenant-connection.service.ts`
- Provisionamento de tenant: `src/modules/control-plane/tenant-provisioning.service.ts`
- Admin da plataforma: `src/modules/platform-admin/`

## Setup rápido

```bash
npm install
npm run prisma:generate
```

Copie `backend/.env.example` para `backend/.env` e preencha:

- `CONTROL_PLANE_DATABASE_URL`
- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `JWT_ACCESS_SECRET`
- `REDIS_URL`

## Migrations e seeds multi-tenant

```bash
# Control plane
npm run mt:migrate:control-plane
npm run mt:seed:control-plane

# Tenants
npm run mt:migrate:tenant -- --company <companyId>
npm run mt:migrate:all-tenants
npm run mt:seed:tenant -- --company <companyId>
```

Bootstrap de base legada (single DB):

```bash
npm run mt:bootstrap:control-plane
```

## Rodar backend

```bash
npm run start:dev
```

## Testes

```bash
npm run test
```

## Referência completa

Consulte `docs/multi-tenancy-saas.md`.
