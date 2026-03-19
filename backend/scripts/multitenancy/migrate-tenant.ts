import {
  decryptConnectionUrl,
  runTenantMigrateDeploy,
  withControlPlaneClient,
} from './_utils';

function parseArg(name: string) {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

async function resolveDatabaseUrl() {
  const directUrl = parseArg('database-url') ?? process.env.TENANT_DATABASE_URL;
  if (directUrl) {
    return directUrl;
  }

  const companyId = parseArg('company');
  if (!companyId) {
    throw new Error(
      'Informe --company <id> ou --database-url <url> (ou TENANT_DATABASE_URL).',
    );
  }

  const appEncryptionKey =
    process.env.APP_ENCRYPTION_KEY ?? 'autoszap-local-encryption-key';

  return withControlPlaneClient(async (controlPlane) => {
    const tenantDatabase = await controlPlane.tenantDatabase.findUnique({
      where: {
        companyId,
      },
      select: {
        connectionUrlEncrypted: true,
      },
    });

    if (!tenantDatabase) {
      throw new Error(`Tenant ${companyId} nao encontrado no control plane.`);
    }

    return decryptConnectionUrl(
      tenantDatabase.connectionUrlEncrypted,
      appEncryptionKey,
    );
  });
}

async function main() {
  const databaseUrl = await resolveDatabaseUrl();
  await runTenantMigrateDeploy(databaseUrl);
  console.log('Migration do tenant concluida com sucesso.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
