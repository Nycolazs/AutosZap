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
import { ContactSource, PermissionKey } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ContactsService } from './contacts.service';

class ContactsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  tagId?: string;
}

class ContactDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsEnum(ContactSource)
  source?: ContactSource;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  tagIds?: string[];
}

@Controller('contacts')
@Permissions(PermissionKey.CONTACTS_VIEW)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser, @Query() query: ContactsQueryDto) {
    return this.contactsService.list(user.workspaceId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.contactsService.findOne(id, user.workspaceId);
  }

  @Permissions(PermissionKey.CONTACTS_EDIT)
  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: ContactDto) {
    return this.contactsService.create(user.workspaceId, dto);
  }

  @Permissions(PermissionKey.CONTACTS_EDIT)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<ContactDto>,
  ) {
    return this.contactsService.update(id, user.workspaceId, dto);
  }

  @Permissions(PermissionKey.CONTACTS_EDIT)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.contactsService.remove(id, user.workspaceId);
  }
}
