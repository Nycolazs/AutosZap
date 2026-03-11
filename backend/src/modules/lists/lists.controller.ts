import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ListsService } from './lists.service';

class ListDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  contactIds?: string[];
}

@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.listsService.list(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.listsService.findOne(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: ListDto) {
    return this.listsService.create(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<ListDto>,
  ) {
    return this.listsService.update(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.listsService.remove(id, user.workspaceId);
  }
}
