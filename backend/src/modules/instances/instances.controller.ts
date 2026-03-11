import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  InstanceMode,
  InstanceProvider,
  InstanceStatus,
  Role,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MetaWhatsAppService } from '../integrations/meta-whatsapp/meta-whatsapp.service';
import { InstancesService } from './instances.service';

class InstanceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(InstanceProvider)
  provider?: InstanceProvider;

  @IsOptional()
  @IsEnum(InstanceStatus)
  status?: InstanceStatus;

  @IsOptional()
  @IsEnum(InstanceMode)
  mode?: InstanceMode;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  webhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;
}

@Controller('instances')
export class InstancesController {
  constructor(
    private readonly instancesService: InstancesService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.instancesService.list(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.findOne(id, user.workspaceId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: InstanceDto) {
    return this.instancesService.create(user.workspaceId, user.sub, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<InstanceDto>,
  ) {
    return this.instancesService.update(id, user.workspaceId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/connect')
  connect(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.connect(id, user.workspaceId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/disconnect')
  disconnect(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.disconnect(id, user.workspaceId);
  }

  @Post(':id/test')
  test(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.testConnection(user.workspaceId, id);
  }

  @Post(':id/sync')
  sync(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.syncInstance(user.workspaceId, id);
  }

  @Post(':id/subscribe-app')
  subscribeApp(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.subscribeApp(user.workspaceId, id);
  }

  @Get(':id/templates')
  listTemplates(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.listTemplates(user.workspaceId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.remove(id, user.workspaceId);
  }
}
