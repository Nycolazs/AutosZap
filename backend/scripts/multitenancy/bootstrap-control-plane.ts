import { Role, UserStatus } from '@prisma/client';
import {
  CompanyStatus,
  GlobalUserStatus,
  MembershipStatus,
  TenantDatabaseStatus,
  TenantRole,
} from '../../src/generated/control-plane-client';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { withControlPlaneClient, withTenantClient } from './_utils';

function encryptConnectionUrl(value: string, encryptionKey: string) {
  const iv = randomBytes(16);
  const key = createHash('sha256').update(encryptionKey).digest();
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function mapRole(role: Role) {
  if (role === Role.ADMIN) return TenantRole.ADMIN;
  if (role === Role.MANAGER) return TenantRole.MANAGER;
  if (role === Role.AGENT) return TenantRole.AGENT;
  return TenantRole.SELLER;
}

function mapUserStatus(status: UserStatus) {
  if (status === UserStatus.ACTIVE) {
    return {
      global: GlobalUserStatus.ACTIVE,
      membership: MembershipStatus.ACTIVE,
    };
  }

  if (status === UserStatus.INACTIVE) {
    return {
      global: GlobalUserStatus.BLOCKED,
      membership: MembershipStatus.INACTIVE,
    };
  }

  return {
    global: GlobalUserStatus.PENDING,
    membership: MembershipStatus.INVITED,
  };
}

async function main() {
  const sourceTenantDatabaseUrl =
    process.env.LEGACY_TENANT_DATABASE_URL ?? process.env.DATABASE_URL;
  const encryptionKey =
    process.env.APP_ENCRYPTION_KEY ?? 'autoszap-local-encryption-key';

  if (!sourceTenantDatabaseUrl) {
    throw new Error(
      'Defina LEGACY_TENANT_DATABASE_URL ou DATABASE_URL para bootstrap.',
    );
  }

  const encryptedConnection = encryptConnectionUrl(
    sourceTenantDatabaseUrl,
    encryptionKey,
  );
  const parsedUrl = new URL(sourceTenantDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, '') || 'legacy_shared';

  await withTenantClient(sourceTenantDatabaseUrl, async (tenantPrisma) => {
    const workspaces = await tenantPrisma.workspace.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        users: {
          where: {
            deletedAt: null,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!workspaces.length) {
      console.log('Nenhuma workspace encontrada no banco legado.');
      return;
    }

    await withControlPlaneClient(async (controlPlane) => {
      for (const workspace of workspaces) {
        const company = await controlPlane.company.upsert({
          where: {
            id: workspace.id,
          },
          update: {
            workspaceId: workspace.id,
            name: workspace.companyName || workspace.name,
            slug: workspace.slug,
            status: CompanyStatus.ACTIVE,
          },
          create: {
            id: workspace.id,
            workspaceId: workspace.id,
            name: workspace.companyName || workspace.name,
            slug: workspace.slug,
            status: CompanyStatus.ACTIVE,
          },
        });

        await controlPlane.tenantDatabase.upsert({
          where: {
            companyId: company.id,
          },
          update: {
            databaseName,
            databaseHost: parsedUrl.hostname || null,
            databasePort: parsedUrl.port ? Number(parsedUrl.port) : null,
            connectionUrlEncrypted: encryptedConnection,
            status: TenantDatabaseStatus.READY,
          },
          create: {
            companyId: company.id,
            databaseName,
            databaseHost: parsedUrl.hostname || null,
            databasePort: parsedUrl.port ? Number(parsedUrl.port) : null,
            connectionUrlEncrypted: encryptedConnection,
            status: TenantDatabaseStatus.READY,
          },
        });

        for (const user of workspace.users) {
          const mappedStatus = mapUserStatus(user.status);
          const globalUser = await controlPlane.globalUser.upsert({
            where: {
              email: user.email,
            },
            update: {
              name: user.name,
              passwordHash: user.passwordHash,
              status: mappedStatus.global,
              blockedAt:
                mappedStatus.global === GlobalUserStatus.BLOCKED
                  ? new Date()
                  : null,
              deletedAt: null,
            },
            create: {
              name: user.name,
              email: user.email,
              passwordHash: user.passwordHash,
              status: mappedStatus.global,
              blockedAt:
                mappedStatus.global === GlobalUserStatus.BLOCKED
                  ? new Date()
                  : null,
            },
          });

          await controlPlane.companyMembership.upsert({
            where: {
              companyId_globalUserId: {
                companyId: company.id,
                globalUserId: globalUser.id,
              },
            },
            update: {
              tenantRole: mapRole(user.role),
              status: mappedStatus.membership,
            },
            create: {
              companyId: company.id,
              globalUserId: globalUser.id,
              tenantRole: mapRole(user.role),
              status: mappedStatus.membership,
              isDefault: true,
            },
          });

          await tenantPrisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              globalUserId: globalUser.id,
            },
          });
        }
      }
    });

    console.log(
      `Bootstrap concluido. ${workspaces.length} workspace(s) sincronizadas para o control plane.`,
    );
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
