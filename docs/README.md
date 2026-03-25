# Documentação Técnica do AutosZap

Esta documentação consolida o estado atual do repositório em 25 de março de 2026 e organiza a visão de ponta a ponta da plataforma.

## Objetivo

O AutosZap é uma plataforma SaaS de atendimento, CRM e automação via WhatsApp com:

- backend multi-tenant em NestJS + Prisma;
- frontend web em App Router compatível com Next, executado principalmente via vinext/Vite/Nitro;
- app mobile em Expo/React Native;
- app desktop em Electron;
- contratos e client HTTP compartilhados em `packages/platform-*`.

## Documentos principais

- [Arquitetura da Plataforma](./arquitetura-da-plataforma.md)
  Visão estrutural do monorepo, arquitetura de dados, autenticação, multi-tenancy, módulos de backend, rotas do frontend, apps cliente e integrações externas.

- [Operação e Fluxos](./operacao-e-fluxos.md)
  Setup local, variáveis de ambiente, deploy, releases, checklist operacional e fluxos end-to-end do produto.

## Documentos especializados já existentes

- [Multi-tenancy SaaS](./multi-tenancy-saas.md)
- [Onboarding WhatsApp Playbook](./onboarding-whatsapp-playbook.md)
- [Release Mobile com EAS](./mobile-eas-release.md)
- [Timeout de Conversas em WAITING](./conversation-waiting-timeout.md)
- [Sincronização Backend Produção](./prod-backend-sync-workflow.md)
- [Migração de posição do menu](./fix-menu-position-migration.md)

## Fontes de verdade no repositório

- Monorepo e scripts: `package.json`
- Backend: `backend/src`, `backend/prisma`, `backend/scripts`
- Frontend: `frontend/app`, `frontend/components`, `frontend/lib`
- Mobile: `apps/mobile`
- Desktop: `apps/desktop`
- Contratos compartilhados: `packages/platform-types`, `packages/platform-client`
- Infra local e produção: `docker-compose.yml`, `docker-compose.prod.yml`, `deploy/`, `scripts/`

## Observações importantes

- O repositório atual não contém arquivos `.env.example` ativos em `backend/` ou `frontend/`. A configuração de ambiente precisa ser derivada do código, do `docker-compose` e dos scripts operacionais.
- Existem divergências entre documentos antigos e o estado atual do código, especialmente na operação do frontend em Vercel e em alguns procedimentos de infraestrutura. Os dois documentos principais desta pasta priorizam o estado real do repositório.
- Alguns documentos legados contêm detalhes operacionais sensíveis. Trate-os como material restrito e não replique credenciais ou segredos em novos arquivos.
