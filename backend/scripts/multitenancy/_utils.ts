import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { createHash, createDecipheriv } from 'node:crypto';
import { PrismaClient as ControlPlanePrismaClient } from '@autoszap/control-plane-client';

export function decryptConnectionUrl(
  encryptedValue: string,
  encryptionKey: string,
) {
  if (!encryptedValue) {
    throw new Error('Connection URL criptografada ausente.');
  }

  const [ivHex, encryptedHex] = encryptedValue.split(':');

  if (!ivHex || !encryptedHex) {
    return encryptedValue;
  }

  const key = createHash('sha256').update(encryptionKey).digest();
  const decipher = createDecipheriv(
    'aes-256-cbc',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export async function withControlPlaneClient<T>(
  callback: (client: ControlPlanePrismaClient) => Promise<T>,
) {
  const connectionUrl =
    process.env.CONTROL_PLANE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionUrl) {
    throw new Error(
      'Defina CONTROL_PLANE_DATABASE_URL para executar scripts de multitenancy.',
    );
  }

  const controlPlane = new ControlPlanePrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });

  try {
    await controlPlane.$connect();
    return await callback(controlPlane);
  } finally {
    await controlPlane.$disconnect();
  }
}

export async function runTenantMigrateDeploy(databaseUrl: string) {
  await runPrismaCommand(
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      DATABASE_URL: databaseUrl,
    },
  );
}

export async function runControlPlaneMigrateDeploy() {
  await runPrismaCommand(
    [
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      'prisma/control-plane/schema.prisma',
    ],
    {},
  );
}

export async function runPrismaCommand(
  args: string[],
  envPatch: Record<string, string>,
) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...envPatch,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Comando Prisma falhou com exit code ${code ?? 'n/a'}.`));
    });
  });
}

export async function withTenantClient<T>(
  databaseUrl: string,
  callback: (client: PrismaClient) => Promise<T>,
) {
  const tenantClient = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await tenantClient.$connect();
    return await callback(tenantClient);
  } finally {
    await tenantClient.$disconnect();
  }
}
