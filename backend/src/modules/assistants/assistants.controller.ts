import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AssistantStatus,
  EntityStatus,
  KnowledgeBaseType,
  KnowledgeDocumentType,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { AssistantsService } from './assistants.service';

class AssistantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsString()
  systemPrompt!: string;

  @IsNumber()
  temperature!: number;

  @IsString()
  model!: string;

  @IsOptional()
  @IsEnum(AssistantStatus)
  status?: AssistantStatus;

  @IsOptional()
  @IsArray()
  knowledgeBaseIds?: string[];

  @IsOptional()
  @IsArray()
  toolIds?: string[];
}

class AssistantTestDto {
  @IsString()
  message!: string;
}

class KnowledgeBaseDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(KnowledgeBaseType)
  type!: KnowledgeBaseType;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

class KnowledgeDocumentDto {
  @IsString()
  knowledgeBaseId!: string;

  @IsString()
  title!: string;

  @IsEnum(KnowledgeDocumentType)
  type!: KnowledgeDocumentType;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

class AiToolDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

@Controller('assistants')
export class AssistantsController {
  constructor(private readonly assistantsService: AssistantsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.assistantsService.listAssistants(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.findAssistant(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: AssistantDto) {
    return this.assistantsService.createAssistant(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AssistantDto>,
  ) {
    return this.assistantsService.updateAssistant(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.deleteAssistant(id, user.workspaceId);
  }

  @Post(':id/test')
  test(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: AssistantTestDto,
  ) {
    return this.assistantsService.testAssistant(
      id,
      user.workspaceId,
      dto.message,
    );
  }
}

@Controller('knowledge-bases')
export class KnowledgeBasesController {
  constructor(private readonly assistantsService: AssistantsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.assistantsService.listKnowledgeBases(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.findKnowledgeBase(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: KnowledgeBaseDto) {
    return this.assistantsService.createKnowledgeBase(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<KnowledgeBaseDto>,
  ) {
    return this.assistantsService.updateKnowledgeBase(
      id,
      user.workspaceId,
      dto,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.deleteKnowledgeBase(id, user.workspaceId);
  }
}

@Controller('knowledge-documents')
export class KnowledgeDocumentsController {
  constructor(private readonly assistantsService: AssistantsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentAuthUser,
    @Query('knowledgeBaseId') knowledgeBaseId?: string,
  ) {
    return this.assistantsService.listDocuments(
      user.workspaceId,
      knowledgeBaseId,
    );
  }

  @Post()
  create(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: KnowledgeDocumentDto,
  ) {
    return this.assistantsService.createDocument(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<KnowledgeDocumentDto>,
  ) {
    return this.assistantsService.updateDocument(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.deleteDocument(id, user.workspaceId);
  }
}

@Controller('ai-tools')
export class AiToolsController {
  constructor(private readonly assistantsService: AssistantsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.assistantsService.listTools(user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: AiToolDto) {
    return this.assistantsService.createTool(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<AiToolDto>,
  ) {
    return this.assistantsService.updateTool(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.assistantsService.deleteTool(id, user.workspaceId);
  }
}
