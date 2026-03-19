import * as bcrypt from 'bcrypt';
import { GlobalUserStatus, PlatformRole } from '../../src/generated/control-plane-client';
import { withControlPlaneClient } from './_utils';

async function main() {
  const email =
    process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() ??
    'admin@autoszap.com';
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? '123456';
  const name = process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin';

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await withControlPlaneClient((controlPlane) =>
    controlPlane.globalUser.upsert({
      where: {
        email,
      },
      update: {
        name,
        passwordHash,
        status: GlobalUserStatus.ACTIVE,
        platformRole: PlatformRole.SUPER_ADMIN,
        blockedAt: null,
        deletedAt: null,
      },
      create: {
        name,
        email,
        passwordHash,
        status: GlobalUserStatus.ACTIVE,
        platformRole: PlatformRole.SUPER_ADMIN,
      },
    }),
  );

  console.log(
    `Seed control plane concluido. Super admin: ${user.email} (id=${user.id}).`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
