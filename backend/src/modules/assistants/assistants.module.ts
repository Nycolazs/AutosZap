import { Module } from '@nestjs/common';
import {
  AiToolsController,
  AssistantsController,
  KnowledgeBasesController,
  KnowledgeDocumentsController,
} from './assistants.controller';
import { AssistantsService } from './assistants.service';

@Module({
  controllers: [
    AssistantsController,
    KnowledgeBasesController,
    KnowledgeDocumentsController,
    AiToolsController,
  ],
  providers: [AssistantsService],
})
export class AssistantsModule {}
