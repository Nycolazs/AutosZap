import { Module } from '@nestjs/common';
import { AccessControlModule } from '../../access-control/access-control.module';
import { ConversationWorkflowModule } from '../../conversations/conversation-workflow.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { WorkspaceSettingsModule } from '../../workspace-settings/workspace-settings.module';
import { EventDedupService } from '../../../common/services/event-dedup.service';
import { MetaWhatsAppProvider } from '../meta-whatsapp/meta-whatsapp.provider';
import { WhatsAppWebController } from '../whatsapp-web/whatsapp-web.controller';
import { WhatsAppWebGatewayClient } from '../whatsapp-web/whatsapp-web-gateway.client';
import { WhatsAppWebTransportProvider } from '../whatsapp-web/whatsapp-web.transport-provider';
import { WhatsAppWebService } from '../whatsapp-web/whatsapp-web.service';
import { InstanceConnectionManager } from '../whatsapp-web/instance-connection-manager';
import { MediaProxyService } from '../whatsapp-web/media-proxy.service';
import { SyncOrchestratorService } from '../whatsapp-web/sync-orchestrator.service';
import { WhatsAppMediaStorageService } from './whatsapp-media-storage.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';

@Module({
  imports: [
    AccessControlModule,
    ConversationWorkflowModule,
    NotificationsModule,
    WorkspaceSettingsModule,
  ],
  controllers: [WhatsAppWebController],
  providers: [
    MetaWhatsAppProvider,
    WhatsAppWebGatewayClient,
    WhatsAppWebTransportProvider,
    WhatsAppWebService,
    WhatsAppMediaStorageService,
    WhatsAppMessagingService,
    EventDedupService,
    InstanceConnectionManager,
    MediaProxyService,
    SyncOrchestratorService,
  ],
  exports: [
    MetaWhatsAppProvider,
    WhatsAppWebGatewayClient,
    WhatsAppWebTransportProvider,
    WhatsAppWebService,
    WhatsAppMediaStorageService,
    WhatsAppMessagingService,
    EventDedupService,
    InstanceConnectionManager,
    MediaProxyService,
    SyncOrchestratorService,
  ],
})
export class WhatsAppModule {}
