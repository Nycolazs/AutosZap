import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { CampaignMediaStorageService } from './campaign-media-storage.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignMediaStorageService],
})
export class CampaignsModule {}
