import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { MetaWhatsAppService } from './meta-whatsapp.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppProvider, MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
