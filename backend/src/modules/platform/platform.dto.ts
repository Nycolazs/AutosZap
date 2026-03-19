import { DevicePlatform, DeviceProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

export class CreateLeadInterestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  companyName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  attendantsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}
