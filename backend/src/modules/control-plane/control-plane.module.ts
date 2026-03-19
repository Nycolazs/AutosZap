import { Global, Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TenancyModule } from '../../common/tenancy/tenancy.module';
import { ControlPlaneAuditService } from './control-plane-audit.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Global()
@Module({
  imports: [PrismaModule, CryptoModule, TenancyModule],
  providers: [ControlPlaneAuditService, TenantProvisioningService],
  exports: [ControlPlaneAuditService, TenantProvisioningService],
})
export class ControlPlaneModule {}
