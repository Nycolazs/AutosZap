import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AutoResponseMenusController } from './auto-response-menus.controller';
import { AutoResponseMenusService } from './auto-response-menus.service';

@Module({
  imports: [PrismaModule],
  controllers: [AutoResponseMenusController],
  providers: [AutoResponseMenusService],
  exports: [AutoResponseMenusService],
})
export class AutoResponseMenusModule {}
