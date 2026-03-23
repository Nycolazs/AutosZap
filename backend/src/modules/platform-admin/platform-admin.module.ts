import { Module } from '@nestjs/common';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [ControlPlaneModule, NotificationsModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
