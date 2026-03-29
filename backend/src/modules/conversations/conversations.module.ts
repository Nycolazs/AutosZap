import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RealtimeModule } from '../../common/realtime/realtime.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { ConversationWorkflowModule } from './conversation-workflow.module';
import { ConversationReminderAutomationService } from './conversation-reminder-automation.service';
import { ConversationRemindersController } from './conversation-reminders.controller';
import { ConversationRemindersService } from './conversation-reminders.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesController } from './messages.controller';
import { MessagesCursorController } from './messages-cursor.controller';
import { MessagesCursorService } from './messages-cursor.service';
import { QuickMessagesController } from './quick-messages.controller';
import { QuickMessagesService } from './quick-messages.service';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    RedisModule,
    AccessControlModule,
    WhatsAppModule,
    ConversationWorkflowModule,
    NotificationsModule,
  ],
  controllers: [
    ConversationsController,
    MessagesController,
    MessagesCursorController,
    ConversationRemindersController,
    QuickMessagesController,
  ],
  providers: [
    ConversationsService,
    MessagesCursorService,
    ConversationRemindersService,
    ConversationReminderAutomationService,
    QuickMessagesService,
  ],
  exports: [ConversationsService, MessagesCursorService],
})
export class ConversationsModule {}
