import { Module } from '@nestjs/common';
import { MetaWhatsAppModule } from '../integrations/meta-whatsapp/meta-whatsapp.module';
import { CampaignMediaStorageService } from './campaign-media-storage.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [MetaWhatsAppModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignMediaStorageService],
})
export class CampaignsModule {}
