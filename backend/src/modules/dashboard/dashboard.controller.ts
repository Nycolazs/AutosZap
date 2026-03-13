import { Controller, Get, Query } from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { AnyPermissions } from '../../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@AnyPermissions(
  PermissionKey.DASHBOARD_VIEW,
  PermissionKey.REPORTS_VIEW,
  PermissionKey.VIEW_METRICS,
)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  overview(@CurrentUser() user: CurrentAuthUser) {
    return this.dashboardService.getOverview(user.workspaceId);
  }

  @Get('performance')
  performance(
    @CurrentUser() user: CurrentAuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.dashboardService.getPerformance(user.workspaceId, {
      from,
      to,
      userId,
    });
  }
}
