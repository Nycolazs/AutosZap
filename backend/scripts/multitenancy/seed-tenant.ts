import { spawn } from 'node:child_process';
import {
  decryptConnectionUrl,
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
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ['tsx', 'prisma/seed.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Seed do tenant falhou com exit code ${code ?? 'n/a'}.`));
    });
  });

  console.log('Seed do tenant concluido com sucesso.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
