import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAvatarStorageService } from './user-avatar-storage.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserAvatarStorageService],
  exports: [UsersService, UserAvatarStorageService],
})
export class UsersModule {}
