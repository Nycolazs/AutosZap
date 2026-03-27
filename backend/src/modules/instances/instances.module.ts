import { Module } from '@nestjs/common';
import { MetaWhatsAppModule } from '../integrations/meta-whatsapp/meta-whatsapp.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';

@Module({
  imports: [MetaWhatsAppModule, WhatsAppModule],
  controllers: [InstancesController],
  providers: [InstancesService],
  exports: [InstancesService],
})
export class InstancesModule {}
