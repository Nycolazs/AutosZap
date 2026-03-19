import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import {
  CreatePlatformCompanyDto,
  CreatePlatformUserDto,
  PlatformAuditQueryDto,
  PlatformCompanyListQueryDto,
  PlatformUsersListQueryDto,
  UpdatePlatformCompanyDto,
  UpdatePlatformUserDto,
  UpsertMembershipDto,
} from './platform-admin.dto';
import { PlatformAdminService } from './platform-admin.service';

@PlatformAdmin()
@RateLimit({ limit: 120, windowSeconds: 60 })
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentAuthUser) {
    return this.platformAdminService.getPlatformMe(user.sub);
  }

  @Get('dashboard')
  dashboard() {
    return this.platformAdminService.getDashboard();
  }

  @Get('companies')
  listCompanies(@Query() query: PlatformCompanyListQueryDto) {
    return this.platformAdminService.listCompanies(query);
  }

  @Post('companies')
  createCompany(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: CreatePlatformCompanyDto,
  ) {
    return this.platformAdminService.createCompany(user.sub, dto);
  }

  @Patch('companies/:companyId')
  updateCompany(
    @CurrentUser() user: CurrentAuthUser,
    @Param('companyId') companyId: string,
    @Body() dto: UpdatePlatformCompanyDto,
  ) {
    return this.platformAdminService.updateCompany(user.sub, companyId, dto);
  }

  @Post('companies/:companyId/provision')
  reprovisionCompany(
    @CurrentUser() user: CurrentAuthUser,
    @Param('companyId') companyId: string,
  ) {
    return this.platformAdminService.reprovisionCompany(user.sub, companyId);
  }

  @Get('users')
  listUsers(@Query() query: PlatformUsersListQueryDto) {
    return this.platformAdminService.listGlobalUsers(query);
  }

  @Post('users')
  createUser(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: CreatePlatformUserDto,
  ) {
    return this.platformAdminService.createGlobalUser(user.sub, dto);
  }

  @Patch('users/:globalUserId')
  updateUser(
    @CurrentUser() user: CurrentAuthUser,
    @Param('globalUserId') globalUserId: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.platformAdminService.updateGlobalUser(
      user.sub,
      globalUserId,
      dto,
    );
  }

  @Post('users/:globalUserId/memberships')
  upsertMembership(
    @CurrentUser() user: CurrentAuthUser,
    @Param('globalUserId') globalUserId: string,
    @Body() dto: UpsertMembershipDto,
  ) {
    return this.platformAdminService.upsertMembership(
      user.sub,
      globalUserId,
      dto,
    );
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: PlatformAuditQueryDto) {
    return this.platformAdminService.listAuditLogs(query);
  }
}
