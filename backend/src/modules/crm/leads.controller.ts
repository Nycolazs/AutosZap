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
import { LeadSource, PermissionKey } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CrmService } from './crm.service';

class LeadsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;
}

class LeadDto {
  @IsString()
  pipelineId!: string;

  @IsString()
  stageId!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsString()
  value!: string;

  @IsOptional()
  order?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  tagIds?: string[];
}

class ReorderLeadDto {
  @IsString()
  stageId!: string;

  order!: number;
}

@Controller('leads')
@Permissions(PermissionKey.CRM_VIEW)
export class LeadsController {
  constructor(private readonly crmService: CrmService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser, @Query() query: LeadsQueryDto) {
    return this.crmService.listLeads(user.workspaceId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.crmService.findLead(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: LeadDto) {
    return this.crmService.createLead(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<LeadDto>,
  ) {
    return this.crmService.updateLead(id, user.workspaceId, dto);
  }

  @Patch(':id/reorder')
  reorder(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: ReorderLeadDto,
  ) {
    return this.crmService.reorderLead(
      id,
      user.workspaceId,
      dto.stageId,
      dto.order,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.crmService.deleteLead(id, user.workspaceId);
  }
}
