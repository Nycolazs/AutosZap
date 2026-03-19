import { Global, Module } from '@nestjs/common';
import { ControlPlanePrismaService } from './control-plane-prisma.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, ControlPlanePrismaService],
  exports: [PrismaService, ControlPlanePrismaService],
})
export class PrismaModule {}
