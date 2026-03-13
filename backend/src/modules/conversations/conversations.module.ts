import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RealtimeModule } from '../../common/realtime/realtime.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { MetaWhatsAppModule } from '../integrations/meta-whatsapp/meta-whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationWorkflowModule } from './conversation-workflow.module';
import { ConversationReminderAutomationService } from './conversation-reminder-automation.service';
import { ConversationRemindersController } from './conversation-reminders.controller';
import { ConversationRemindersService } from './conversation-reminders.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    RedisModule,
    AccessControlModule,
    MetaWhatsAppModule,
    ConversationWorkflowModule,
    NotificationsModule,
  ],
  controllers: [
    ConversationsController,
    MessagesController,
    ConversationRemindersController,
  ],
  providers: [
    ConversationsService,
    ConversationRemindersService,
    ConversationReminderAutomationService,
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}
