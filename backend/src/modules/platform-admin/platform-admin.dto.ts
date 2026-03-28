import {
  CompanyStatus,
  GlobalUserStatus,
  LeadInterestStatus,
  MembershipStatus,
  PlatformRole,
  TenantRole,
} from '@autoszap/control-plane-client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePlatformCompanyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;

  @IsString()
  @MinLength(6)
  adminPasswordConfirm!: string;
}

export class UpdatePlatformCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}

export class PlatformCompanyListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  activity?: 'all' | 'active' | 'inactive';
}

export class PlatformUsersListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  activity?: 'all' | 'active' | 'inactive';

  @IsOptional()
  @IsString()
  companyId?: string;
}

export class CreatePlatformUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(6)
  confirmPassword!: string;

  @IsOptional()
  @IsEnum(PlatformRole)
  platformRole?: PlatformRole;

  @IsOptional()
  @IsEnum(GlobalUserStatus)
  status?: GlobalUserStatus;
}

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(GlobalUserStatus)
  status?: GlobalUserStatus;

  @IsOptional()
  @IsEnum(PlatformRole)
  platformRole?: PlatformRole | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  confirmPassword?: string;
}

export class UpsertMembershipDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsEnum(TenantRole)
  tenantRole?: TenantRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class PlatformAuditQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class PlatformLeadInterestsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LeadInterestStatus)
  status?: LeadInterestStatus;

  @IsOptional()
  @IsIn(['createdAt_desc', 'createdAt_asc'])
  sort?: 'createdAt_desc' | 'createdAt_asc';
}

export class UpdatePlatformLeadInterestDto {
  @IsEnum(LeadInterestStatus)
  status!: LeadInterestStatus;
}
