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
  PlatformLeadInterestsQueryDto,
  PlatformUsersListQueryDto,
  UpdatePlatformCompanyDto,
  UpdatePlatformLeadInterestDto,
  UpdatePlatformUserDto,
  UpsertMembershipDto,
} from './platform-admin.dto';
import { PlatformAdminService } from './platform-admin.service';

@PlatformAdmin()
@RateLimit({ limit: 120, windowSeconds: 60 })
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  private getActorGlobalUserId(user: CurrentAuthUser) {
    return user.globalUserId ?? user.sub;
  }

  @Get('me')
  me(@CurrentUser() user: CurrentAuthUser) {
    return this.platformAdminService.getPlatformMe(
      this.getActorGlobalUserId(user),
    );
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
    return this.platformAdminService.createCompany(
      this.getActorGlobalUserId(user),
      dto,
    );
  }

  @Patch('companies/:companyId')
  updateCompany(
    @CurrentUser() user: CurrentAuthUser,
    @Param('companyId') companyId: string,
    @Body() dto: UpdatePlatformCompanyDto,
  ) {
    return this.platformAdminService.updateCompany(
      this.getActorGlobalUserId(user),
      companyId,
      dto,
    );
  }

  @Post('companies/:companyId/provision')
  reprovisionCompany(
    @CurrentUser() user: CurrentAuthUser,
    @Param('companyId') companyId: string,
  ) {
    return this.platformAdminService.reprovisionCompany(
      this.getActorGlobalUserId(user),
      companyId,
    );
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
    return this.platformAdminService.createGlobalUser(
      this.getActorGlobalUserId(user),
      dto,
    );
  }

  @Patch('users/:globalUserId')
  updateUser(
    @CurrentUser() user: CurrentAuthUser,
    @Param('globalUserId') globalUserId: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.platformAdminService.updateGlobalUser(
      this.getActorGlobalUserId(user),
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
      this.getActorGlobalUserId(user),
      globalUserId,
      dto,
    );
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: PlatformAuditQueryDto) {
    return this.platformAdminService.listAuditLogs(query);
  }

  @Get('lead-interests')
  listLeadInterests(@Query() query: PlatformLeadInterestsQueryDto) {
    return this.platformAdminService.listLeadInterests(query);
  }

  @Patch('lead-interests/:leadInterestId')
  updateLeadInterest(
    @CurrentUser() user: CurrentAuthUser,
    @Param('leadInterestId') leadInterestId: string,
    @Body() dto: UpdatePlatformLeadInterestDto,
  ) {
    return this.platformAdminService.updateLeadInterest(
      this.getActorGlobalUserId(user),
      leadInterestId,
      dto,
    );
  }

  @Get('support-tickets')
  listSupportTickets(@Query() query: { status?: string; page?: string; limit?: string }) {
    return this.platformAdminService.listSupportTickets({
      status: query.status,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Patch('support-tickets/:ticketId/status')
  updateSupportTicketStatus(
    @Param('ticketId') ticketId: string,
    @Body() dto: { status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' },
  ) {
    return this.platformAdminService.updateSupportTicketStatus(ticketId, dto.status);
  }
}
