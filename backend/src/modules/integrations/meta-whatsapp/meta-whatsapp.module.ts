import { Module } from '@nestjs/common';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { MetaWhatsAppService } from './meta-whatsapp.service';

@Module({
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppProvider, MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
