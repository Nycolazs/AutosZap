import {
  decryptConnectionUrl,
  runTenantMigrateDeploy,
  withControlPlaneClient,
} from './_utils';

async function main() {
  const appEncryptionKey =
    process.env.APP_ENCRYPTION_KEY ?? 'autoszap-local-encryption-key';

  const tenants = await withControlPlaneClient((controlPlane) =>
    controlPlane.tenantDatabase.findMany({
      where: {
        status: 'READY',
      },
      select: {
        companyId: true,
        databaseName: true,
        connectionUrlEncrypted: true,
      },
      orderBy: {
        companyId: 'asc',
      },
    }),
  );

  if (!tenants.length) {
    console.log('Nenhum tenant READY encontrado para migrar.');
    return;
  }

  for (const tenant of tenants) {
    const databaseUrl = decryptConnectionUrl(
      tenant.connectionUrlEncrypted,
      appEncryptionKey,
    );
    console.log(
      `[tenant:${tenant.companyId}] Aplicando migrations em ${tenant.databaseName}...`,
    );
    await runTenantMigrateDeploy(databaseUrl);
  }

  console.log(`Migrations aplicadas para ${tenants.length} tenant(s).`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
