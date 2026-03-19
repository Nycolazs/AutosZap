import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'platform_admin';

export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
