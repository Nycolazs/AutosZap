import { Module } from '@nestjs/common';
import { MetaWhatsAppModule } from '../integrations/meta-whatsapp/meta-whatsapp.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [MetaWhatsAppModule],
  controllers: [ConversationsController, MessagesController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
