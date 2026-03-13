import { DevicePlatform, DeviceProvider } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(120)
  installationId!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsEnum(DeviceProvider)
  provider!: DeviceProvider;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pushToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buildNumber?: string;
}

export class UnregisterDeviceDto {
  @IsString()
  @MaxLength(120)
  installationId!: string;
}

export class PlatformReleasesQueryDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}
