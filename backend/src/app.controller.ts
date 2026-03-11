import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'autoszap-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
