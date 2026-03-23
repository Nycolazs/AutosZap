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
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CurrentUser,
  type CurrentAuthUser,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionKey } from '@prisma/client';
import {
  AutoResponseMenusService,
  MenuNodeInput,
} from './auto-response-menus.service';

class MenuNodeDto implements MenuNodeInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  label!: string;

  @IsString()
  message!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuNodeDto)
  children?: MenuNodeDto[];
}

class CreateMenuDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuNodeDto)
  nodes?: MenuNodeDto[];
}

class UpdateMenuDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuNodeDto)
  nodes?: MenuNodeDto[];
}

@Controller('auto-response-menus')
export class AutoResponseMenusController {
  constructor(private readonly service: AutoResponseMenusService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.service.list(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.service.findOne(user.workspaceId, id);
  }

  @Post()
  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: CreateMenuDto) {
    return this.service.create(user.workspaceId, dto);
  }

  @Patch(':id')
  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.service.update(user.workspaceId, id, dto);
  }

  @Patch(':id/toggle-active')
  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  toggleActive(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.service.toggleActive(user.workspaceId, id);
  }

  @Delete(':id')
  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.service.remove(user.workspaceId, id);
  }
}
