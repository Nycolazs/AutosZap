import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CrmService } from './crm.service';

class StageDto {
  @IsString()
  pipelineId!: string;

  @IsString()
  name!: string;

  @IsString()
  color!: string;

  @IsInt()
  order!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  probability!: number;
}

@Controller('pipeline-stages')
@Permissions(PermissionKey.PIPELINE_VIEW)
export class PipelineStagesController {
  constructor(private readonly crmService: CrmService) {}

  @Get()
  getPipeline(@CurrentUser() user: CurrentAuthUser) {
    return this.crmService.getPipeline(user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: StageDto) {
    return this.crmService.createStage(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<StageDto>,
  ) {
    return this.crmService.updateStage(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.crmService.deleteStage(id, user.workspaceId);
  }
}
