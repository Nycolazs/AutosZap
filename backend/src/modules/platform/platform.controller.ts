import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import {
  CreateLeadInterestDto,
  PlatformReleasesQueryDto,
  RegisterDeviceDto,
  UnregisterDeviceDto,
} from './platform.dto';
import { PlatformService } from './platform.service';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post('devices/register')
  registerDevice(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.platformService.registerDevice(user, dto);
  }

  @Post('devices/unregister')
  unregisterDevice(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UnregisterDeviceDto,
  ) {
    return this.platformService.unregisterDevice(user, dto.installationId);
  }

  @Public()
  @Get('releases')
  listReleases(@Query() query: PlatformReleasesQueryDto) {
    return this.platformService.listReleases(query);
  }

  @Public()
  @Get('releases/download/windows')
  @Redirect(undefined, 302)
  async downloadWindowsInstaller() {
    const url = await this.platformService.resolveWindowsInstallerDownloadUrl();
    return { url };
  }

  @Public()
  @RateLimit({ limit: 8, windowSeconds: 60 })
  @Post('lead-interests')
  createLeadInterest(
    @Body() dto: CreateLeadInterestDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.platformService.createLeadInterest(dto, {
      userAgent,
      ipAddress,
    });
  }
}
