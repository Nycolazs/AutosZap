import { Global, Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  imports: [CryptoModule, PrismaModule],
  providers: [TenantContextService, TenantConnectionService],
  exports: [TenantContextService, TenantConnectionService],
})
export class TenancyModule {}
