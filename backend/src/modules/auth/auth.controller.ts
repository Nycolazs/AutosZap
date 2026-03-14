import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.login(dto, userAgent, ipAddress);
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @Post('refresh')
  refresh(
    @Body() dto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.refresh(dto, userAgent, ipAddress);
  }

  @Post('logout')
  logout(@CurrentUser() user: CurrentAuthUser, @Body() dto: LogoutDto) {
    return this.authService.logout(user.sub, dto.refreshToken);
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 900 })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 900 })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentAuthUser) {
    return this.authService.me(user.sub);
  }
}
