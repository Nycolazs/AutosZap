import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';

@Module({
  imports: [WhatsAppModule, NotificationsModule],
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
