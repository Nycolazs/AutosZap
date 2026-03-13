import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { WorkspaceSettingsController } from './workspace-settings.controller';
import { WorkspaceSettingsService } from './workspace-settings.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceSettingsController],
  providers: [WorkspaceSettingsService],
  exports: [WorkspaceSettingsService],
})
export class WorkspaceSettingsModule {}
