import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AccessControlService } from './access-control.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
