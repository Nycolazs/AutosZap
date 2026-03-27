import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { normalizeRole } from '../access-control/permissions.constants';
import {
  generateSecureToken,
  hashOpaqueToken,
  parseDurationToMs,
} from '../../common/utils/auth';
import {
  Company,
  CompanyMembership,
  CompanyStatus,
  GlobalUser,
  GlobalUserSocialAccount,
  GlobalUserStatus,
  InviteCodeStatus,
  MembershipStatus,
  PlatformAuditAction,
  PlatformRole,
  SocialAuthProvider,
  TenantDatabaseStatus,
  TenantRole,
} from '@autoszap/control-plane-client';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { ControlPlaneAuditService } from '../control-plane/control-plane-audit.service';
import { TenantProvisioningService } from '../control-plane/tenant-provisioning.service';
import {
  ConnectSocialProviderDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SocialLoginDto,
  SwitchCompanyDto,
  ValidateInviteCodeDto,
} from './auth.dto';
import { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { TenantConnectionService } from '../../common/tenancy/tenant-connection.service';

interface AuthUserPayload {
  sub: string;
  globalUserId?: string;
  email: string;
  name: string;
  workspaceId: string;
  role: Role;
  companyId?: string;
  membershipId?: string;
  platformRole?: PlatformRole;
}

type SessionMembership = CompanyMembership & {
  company: Company;
};

type VerifiedSocialProfile = {
  email?: string;
  name?: string;
  picture?: string;
  providerUserId?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly accessControlService: AccessControlService,
    private readonly controlPlaneAuditService: ControlPlaneAuditService,
    private readonly tenantProvisioningService: TenantProvisioningService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'Voce precisa aceitar os termos para criar a conta.',
      );
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const email = dto.email.toLowerCase().trim();
    const existingGlobalUser =
      await this.controlPlanePrisma.globalUser.findUnique({
        where: { email },
      });

    if (existingGlobalUser && existingGlobalUser.deletedAt === null) {
      throw new BadRequestException('Ja existe uma conta com este email.');
    }

    // ── Invite code flow: join existing company (always allowed) ──
    if (dto.inviteCode) {
      return this.registerWithInviteCode(dto, email, existingGlobalUser);
    }

    // ── Public signup (no invite): check if allowed ──
    const allowPublicSignup = this.isPublicSignupEnabled();

    if (!allowPublicSignup) {
      throw new BadRequestException(
        'Cadastro direto desativado. Use o formulario "Quero ser cliente".',
      );
    }

    if (!dto.companyName) {
      throw new BadRequestException('Informe o nome da empresa.');
    }

    const companySlug = await this.generateUniqueCompanySlug(dto.companyName);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const companyId = randomUUID();
    const workspaceId = companyId;

    const { company, membership, globalUser } =
      await this.controlPlanePrisma.$transaction(async (tx) => {
        const createdCompany = await tx.company.create({
          data: {
            id: companyId,
            workspaceId,
            name: dto.companyName!,
            slug: companySlug,
            segment: dto.segment ?? null,
            status: CompanyStatus.ACTIVE,
          },
        });

        const createdGlobalUser = existingGlobalUser
          ? await tx.globalUser.update({
              where: {
                id: existingGlobalUser.id,
              },
              data: {
                name: dto.name,
                passwordHash,
                status: GlobalUserStatus.ACTIVE,
                deletedAt: null,
                blockedAt: null,
              },
            })
          : await tx.globalUser.create({
              data: {
                name: dto.name,
                email,
                passwordHash,
                status: GlobalUserStatus.ACTIVE,
              },
            });

        const createdMembership = await tx.companyMembership.create({
          data: {
            companyId: createdCompany.id,
            globalUserId: createdGlobalUser.id,
            tenantRole: TenantRole.ADMIN,
            status: MembershipStatus.ACTIVE,
            isDefault: true,
          },
        });

        return {
          company: createdCompany,
          membership: createdMembership,
          globalUser: createdGlobalUser,
        };
      });

    try {
      await this.tenantProvisioningService.provisionTenant({
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        workspaceId: company.workspaceId,
        requestedById: globalUser.id,
        admin: {
          globalUserId: globalUser.id,
          name: globalUser.name,
          email: globalUser.email,
          passwordHash,
        },
      });
    } catch (error) {
      await this.controlPlanePrisma.company.update({
        where: {
          id: company.id,
        },
        data: {
          status: CompanyStatus.INACTIVE,
        },
      });

      throw error;
    }

    await this.controlPlaneAuditService.log({
      actorId: globalUser.id,
      action: PlatformAuditAction.COMPANY_CREATED,
      entityType: 'company',
      entityId: company.id,
      metadata: {
        slug: company.slug,
      },
    });

    const hydratedMembership = {
      ...membership,
      company,
    } satisfies SessionMembership;

    return this.issueSession(globalUser, hydratedMembership);
  }

  async validateInviteCode(dto: ValidateInviteCodeDto) {
    const code = dto.code.toUpperCase().trim();
    const invite = await this.controlPlanePrisma.companyInviteCode.findUnique({
      where: { code },
      include: { company: true },
    });

    if (
      !invite ||
      invite.status !== InviteCodeStatus.ACTIVE ||
      invite.company.status !== CompanyStatus.ACTIVE
    ) {
      throw new BadRequestException('Codigo de convite invalido ou expirado.');
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      await this.controlPlanePrisma.companyInviteCode.update({
        where: { id: invite.id },
        data: { status: InviteCodeStatus.EXPIRED },
      });
      throw new BadRequestException('Codigo de convite expirado.');
    }

    return {
      valid: true,
      companyName: invite.company.name,
      role: invite.role,
      title: invite.title,
    };
  }

  private async registerWithInviteCode(
    dto: RegisterDto,
    email: string,
    existingGlobalUser: GlobalUser | null,
  ) {
    const code = dto.inviteCode!.toUpperCase().trim();
    const invite = await this.controlPlanePrisma.companyInviteCode.findUnique({
      where: { code },
      include: { company: true },
    });

    if (
      !invite ||
      invite.status !== InviteCodeStatus.ACTIVE ||
      invite.company.status !== CompanyStatus.ACTIVE
    ) {
      throw new BadRequestException('Codigo de convite invalido ou expirado.');
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      await this.controlPlanePrisma.companyInviteCode.update({
        where: { id: invite.id },
        data: { status: InviteCodeStatus.EXPIRED },
      });
      throw new BadRequestException('Codigo de convite expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const tenantRole = invite.role;
    const prismaRole = this.mapTenantRoleToTenantRoleEnum(tenantRole);

    // Create or update global user + membership in control plane
    const { globalUser, membership } =
      await this.controlPlanePrisma.$transaction(async (tx) => {
        const createdGlobalUser = existingGlobalUser
          ? await tx.globalUser.update({
              where: { id: existingGlobalUser.id },
              data: {
                name: dto.name,
                passwordHash,
                status: GlobalUserStatus.ACTIVE,
                deletedAt: null,
                blockedAt: null,
              },
            })
          : await tx.globalUser.create({
              data: {
                name: dto.name,
                email,
                passwordHash,
                status: GlobalUserStatus.ACTIVE,
              },
            });

        const hasActiveMembership = await tx.companyMembership.findFirst({
          where: {
            globalUserId: createdGlobalUser.id,
            status: MembershipStatus.ACTIVE,
          },
          select: { id: true },
        });

        const createdMembership = await tx.companyMembership.create({
          data: {
            companyId: invite.companyId,
            globalUserId: createdGlobalUser.id,
            tenantRole,
            status: MembershipStatus.ACTIVE,
            isDefault: !hasActiveMembership,
          },
        });

        // Mark invite code as used
        await tx.companyInviteCode.update({
          where: { id: invite.id },
          data: {
            status: InviteCodeStatus.USED,
            usedByGlobalUserId: createdGlobalUser.id,
            usedAt: new Date(),
          },
        });

        return {
          globalUser: createdGlobalUser,
          membership: createdMembership,
        };
      });

    // Create tenant user in the company's workspace
    const workspaceId = invite.company.workspaceId;
    await this.prisma.runWithTenant(invite.companyId, async () => {
      const existingTenantUser = await this.prisma.user.findFirst({
        where: {
          workspaceId,
          OR: [{ globalUserId: globalUser.id }, { email }],
        },
      });

      if (!existingTenantUser) {
        const inviteWorkspaceRoleId = invite.workspaceRoleId ?? null;
        const tenantUser = await this.prisma.user.create({
          data: {
            workspaceId,
            globalUserId: globalUser.id,
            name: dto.name,
            email,
            passwordHash,
            role: prismaRole,
            status: UserStatus.ACTIVE,
            title: invite.title,
            workspaceRoleId: inviteWorkspaceRoleId,
          },
        });

        // Also create team member record
        await this.prisma.teamMember.create({
          data: {
            workspaceId,
            userId: tenantUser.id,
            name: dto.name,
            email,
            title: invite.title,
            role: prismaRole,
            status: UserStatus.ACTIVE,
            inviteToken: null,
            workspaceRoleId: inviteWorkspaceRoleId,
          },
        });
      }
    });

    await this.controlPlaneAuditService.log({
      actorId: globalUser.id,
      action: PlatformAuditAction.MEMBERSHIP_CREATED,
      entityType: 'company_membership',
      entityId: membership.id,
      metadata: {
        companyId: invite.companyId,
        inviteCode: code,
        role: tenantRole,
      },
    });

    const hydratedMembership = {
      ...membership,
      company: invite.company,
    } satisfies SessionMembership;

    return this.issueSession(globalUser, hydratedMembership);
  }

  async socialLogin(
    dto: SocialLoginDto,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const profile = await this.verifySocialToken(dto.provider, dto.token);
    const socialProvider = this.mapSocialProvider(dto.provider);

    const email =
      profile.email?.toLowerCase().trim() ??
      (dto.provider === 'facebook' && profile.providerUserId
        ? `facebook_${profile.providerUserId}@facebook.autoszap.local`
        : null);

    if (!email) {
      throw new BadRequestException(
        'Nao foi possivel obter os dados necessarios do provedor social para autenticar.',
      );
    }

    const name: string =
      dto.name || profile.name || email.split('@')[0] || 'Usuario';
    const avatarUrl = this.normalizeOptionalString(profile.picture);
    const globalUserByProvider = await this.findGlobalUserBySocialAccount(
      socialProvider,
      profile.providerUserId,
    );
    let globalUser =
      globalUserByProvider ??
      (await this.controlPlanePrisma.globalUser.findUnique({
        where: { email },
      }));

    await this.assertSocialAccountCanBeLinked(
      globalUser?.id ?? null,
      socialProvider,
      profile.providerUserId,
    );

    if (globalUser && globalUser.deletedAt !== null) {
      globalUser = await this.controlPlanePrisma.globalUser.update({
        where: { id: globalUser.id },
        data: {
          name,
          ...this.buildSocialAvatarUpdateData(globalUser, avatarUrl),
          status: GlobalUserStatus.ACTIVE,
          deletedAt: null,
          blockedAt: null,
        },
      });
    }

    if (globalUser) {
      const memberships =
        await this.controlPlanePrisma.companyMembership.findMany({
          where: {
            globalUserId: globalUser.id,
            status: MembershipStatus.ACTIVE,
            company: { status: CompanyStatus.ACTIVE },
          },
          include: { company: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });

      const membership = memberships[0] ?? null;
      if (!membership && !this.hasPlatformAccess(globalUser.platformRole)) {
        throw new UnauthorizedException('Usuario sem empresa ativa vinculada.');
      }

      await this.linkSocialAccount(
        globalUser.id,
        socialProvider,
        profile.providerUserId,
        profile.email,
        true,
      );

      globalUser = await this.controlPlanePrisma.globalUser.update({
        where: { id: globalUser.id },
        data: {
          lastLoginAt: new Date(),
          ...this.buildSocialAvatarUpdateData(globalUser, avatarUrl),
        },
      });

      await this.controlPlaneAuditService.log({
        actorId: globalUser.id,
        action: PlatformAuditAction.LOGIN,
        entityType: 'global_user',
        entityId: globalUser.id,
        metadata: {
          provider: dto.provider,
          companyId: membership?.companyId ?? null,
        },
        ipAddress,
        userAgent,
      });

      return this.issueSession(globalUser, membership, {
        userAgent,
        ipAddress,
      });
    }

    // ── Social login with invite code (join existing company) ──
    if (dto.inviteCode) {
      return this.socialLoginWithInviteCode(
        dto,
        email,
        name,
        avatarUrl ?? null,
        socialProvider,
        profile.providerUserId ?? null,
        globalUser ?? null,
        userAgent,
        ipAddress,
      );
    }

    if (dto.loginOnly) {
      throw new BadRequestException(
        'Nao encontramos uma conta com este email. Cadastre-se para continuar.',
      );
    }

    const allowPublicSignup = this.isPublicSignupEnabled();

    if (!allowPublicSignup && !dto.companyName) {
      throw new BadRequestException(
        'Cadastro direto desativado. Entre em contato com o administrador.',
      );
    }

    const companyName = dto.companyName || `Empresa de ${name.split(' ')[0]}`;
    const companySlug = await this.generateUniqueCompanySlug(companyName);
    const randomPassword = randomUUID();
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const companyId = randomUUID();
    const workspaceId = companyId;

    const {
      company,
      membership,
      globalUser: newGlobalUser,
    } = await this.controlPlanePrisma.$transaction(async (tx) => {
      const createdCompany = await tx.company.create({
        data: {
          id: companyId,
          workspaceId,
          name: companyName,
          slug: companySlug,
          status: CompanyStatus.ACTIVE,
        },
      });

      const createdGlobalUser = await tx.globalUser.create({
        data: {
          name,
          email,
          passwordHash,
          avatarUrl,
          status: GlobalUserStatus.ACTIVE,
        },
      });

      const createdMembership = await tx.companyMembership.create({
        data: {
          companyId: createdCompany.id,
          globalUserId: createdGlobalUser.id,
          tenantRole: TenantRole.ADMIN,
          status: MembershipStatus.ACTIVE,
          isDefault: true,
        },
      });

      return {
        company: createdCompany,
        membership: createdMembership,
        globalUser: createdGlobalUser,
      };
    });

    await this.linkSocialAccount(
      newGlobalUser.id,
      socialProvider,
      profile.providerUserId,
      profile.email,
      true,
    );

    try {
      await this.tenantProvisioningService.provisionTenant({
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        workspaceId: company.workspaceId,
        requestedById: newGlobalUser.id,
        admin: {
          globalUserId: newGlobalUser.id,
          name: newGlobalUser.name,
          email: newGlobalUser.email,
          passwordHash,
        },
      });
    } catch (error) {
      await this.controlPlanePrisma.company.update({
        where: { id: company.id },
        data: { status: CompanyStatus.INACTIVE },
      });
      throw error;
    }

    await this.controlPlaneAuditService.log({
      actorId: newGlobalUser.id,
      action: PlatformAuditAction.COMPANY_CREATED,
      entityType: 'company',
      entityId: company.id,
      metadata: { slug: company.slug, provider: dto.provider },
    });

    const hydratedMembership = {
      ...membership,
      company,
    } satisfies SessionMembership;

    return this.issueSession(newGlobalUser, hydratedMembership, {
      userAgent,
      ipAddress,
    });
  }

  async connectProvider(user: CurrentAuthUser, dto: ConnectSocialProviderDto) {
    const globalUserId = user.globalUserId ?? user.sub;
    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: { id: globalUserId },
    });

    if (!globalUser || globalUser.deletedAt) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (globalUser.status !== GlobalUserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Somente usuarios ativos podem conectar provedores sociais.',
      );
    }

    const profile = await this.verifySocialToken(dto.provider, dto.token);
    const socialProvider = this.mapSocialProvider(dto.provider);
    const normalizedEmail = this.normalizeOptionalString(profile.email);

    if (normalizedEmail) {
      const existingUserWithSocialEmail =
        await this.controlPlanePrisma.globalUser.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });

      if (
        existingUserWithSocialEmail &&
        existingUserWithSocialEmail.id !== globalUser.id
      ) {
        throw new BadRequestException(
          'Esta conta social pertence a outro usuario cadastrado.',
        );
      }
    }

    await this.assertSocialAccountCanBeLinked(
      globalUser.id,
      socialProvider,
      profile.providerUserId,
    );
    await this.linkSocialAccount(
      globalUser.id,
      socialProvider,
      profile.providerUserId,
      profile.email,
      true,
    );

    const updatedGlobalUser = await this.controlPlanePrisma.globalUser.update({
      where: { id: globalUser.id },
      data: this.buildSocialAvatarUpdateData(
        globalUser,
        this.normalizeOptionalString(profile.picture),
      ),
    });

    return {
      connected: true,
      provider: dto.provider,
      avatarUrl: this.resolveAuthUserAvatarUrl(updatedGlobalUser),
    };
  }

  private async socialLoginWithInviteCode(
    dto: SocialLoginDto,
    email: string,
    name: string,
    avatarUrl: string | null,
    socialProvider: SocialAuthProvider,
    providerUserId: string | null,
    existingGlobalUser: GlobalUser | null,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const code = dto.inviteCode!.toUpperCase().trim();
    const invite = await this.controlPlanePrisma.companyInviteCode.findUnique({
      where: { code },
      include: { company: true },
    });

    if (
      !invite ||
      invite.status !== InviteCodeStatus.ACTIVE ||
      invite.company.status !== CompanyStatus.ACTIVE
    ) {
      throw new BadRequestException('Codigo de convite invalido ou expirado.');
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      await this.controlPlanePrisma.companyInviteCode.update({
        where: { id: invite.id },
        data: { status: InviteCodeStatus.EXPIRED },
      });
      throw new BadRequestException('Codigo de convite expirado.');
    }

    const randomPassword = randomUUID();
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const tenantRole = invite.role;
    const prismaRole = this.mapTenantRoleToTenantRoleEnum(tenantRole);

    const { globalUser, membership } =
      await this.controlPlanePrisma.$transaction(async (tx) => {
        const createdGlobalUser = existingGlobalUser
          ? await tx.globalUser.update({
              where: { id: existingGlobalUser.id },
              data: {
                name,
                ...this.buildSocialAvatarUpdateData(
                  existingGlobalUser,
                  avatarUrl,
                ),
                status: GlobalUserStatus.ACTIVE,
                deletedAt: null,
                blockedAt: null,
              },
            })
          : await tx.globalUser.create({
              data: {
                name,
                email,
                passwordHash,
                ...(avatarUrl ? { avatarUrl } : {}),
                status: GlobalUserStatus.ACTIVE,
              },
            });

        const hasActiveMembership = await tx.companyMembership.findFirst({
          where: {
            globalUserId: createdGlobalUser.id,
            status: MembershipStatus.ACTIVE,
          },
          select: { id: true },
        });

        const createdMembership = await tx.companyMembership.create({
          data: {
            companyId: invite.companyId,
            globalUserId: createdGlobalUser.id,
            tenantRole,
            status: MembershipStatus.ACTIVE,
            isDefault: !hasActiveMembership,
          },
        });

        await tx.companyInviteCode.update({
          where: { id: invite.id },
          data: {
            status: InviteCodeStatus.USED,
            usedByGlobalUserId: createdGlobalUser.id,
            usedAt: new Date(),
          },
        });

        return {
          globalUser: createdGlobalUser,
          membership: createdMembership,
        };
      });

    await this.linkSocialAccount(
      globalUser.id,
      socialProvider,
      providerUserId,
      email,
      true,
    );

    // Create tenant user in the company's workspace
    const workspaceId = invite.company.workspaceId;
    await this.prisma.runWithTenant(invite.companyId, async () => {
      const existingTenantUser = await this.prisma.user.findFirst({
        where: {
          workspaceId,
          OR: [{ globalUserId: globalUser.id }, { email }],
        },
      });

      if (!existingTenantUser) {
        const inviteWorkspaceRoleId = invite.workspaceRoleId ?? null;
        const tenantUser = await this.prisma.user.create({
          data: {
            workspaceId,
            globalUserId: globalUser.id,
            name,
            email,
            passwordHash,
            role: prismaRole,
            status: UserStatus.ACTIVE,
            title: invite.title,
            workspaceRoleId: inviteWorkspaceRoleId,
          },
        });

        await this.prisma.teamMember.create({
          data: {
            workspaceId,
            userId: tenantUser.id,
            name,
            email,
            title: invite.title,
            role: prismaRole,
            status: UserStatus.ACTIVE,
            inviteToken: null,
            workspaceRoleId: inviteWorkspaceRoleId,
          },
        });
      }
    });

    await this.controlPlaneAuditService.log({
      actorId: globalUser.id,
      action: PlatformAuditAction.MEMBERSHIP_CREATED,
      entityType: 'company_membership',
      entityId: membership.id,
      metadata: {
        companyId: invite.companyId,
        inviteCode: code,
        role: tenantRole,
        provider: dto.provider,
      },
    });

    const hydratedMembership = {
      ...membership,
      company: invite.company,
    } satisfies SessionMembership;

    return this.issueSession(globalUser, hydratedMembership, {
      userAgent,
      ipAddress,
    });
  }

  private mapSocialProvider(
    provider: 'google' | 'facebook',
  ): SocialAuthProvider {
    return provider === 'google'
      ? SocialAuthProvider.GOOGLE
      : SocialAuthProvider.FACEBOOK;
  }

  private normalizeOptionalString(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private buildManagedUserAvatarUrl(cacheKey?: string | number | Date | null) {
    const normalizedCacheKey =
      cacheKey instanceof Date ? cacheKey.getTime() : cacheKey;

    if (!normalizedCacheKey) {
      return '/api/proxy/users/profile/avatar';
    }

    return `/api/proxy/users/profile/avatar?v=${encodeURIComponent(
      String(normalizedCacheKey),
    )}`;
  }

  private resolveAuthUserAvatarUrl(
    globalUser: Pick<
      GlobalUser,
      'avatarStoragePath' | 'updatedAt' | 'avatarUrl'
    >,
    fallback?: string | null,
  ) {
    if (globalUser.avatarStoragePath) {
      return this.buildManagedUserAvatarUrl(globalUser.updatedAt);
    }

    return globalUser.avatarUrl ?? fallback ?? null;
  }

  private buildSocialAvatarUpdateData(
    globalUser: Pick<GlobalUser, 'avatarStoragePath'>,
    avatarUrl?: string | null,
  ) {
    if (globalUser.avatarStoragePath) {
      return {};
    }

    const normalizedAvatarUrl = this.normalizeOptionalString(avatarUrl);

    if (!normalizedAvatarUrl) {
      return {};
    }

    return {
      avatarUrl: normalizedAvatarUrl,
    };
  }

  private async findGlobalUserBySocialAccount(
    provider: SocialAuthProvider,
    providerUserId?: string,
  ) {
    const normalizedProviderUserId =
      this.normalizeOptionalString(providerUserId);

    if (!normalizedProviderUserId) {
      return null;
    }

    const account =
      await this.controlPlanePrisma.globalUserSocialAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: normalizedProviderUserId,
          },
        },
        include: {
          globalUser: true,
        },
      });

    return account?.globalUser ?? null;
  }

  private async assertSocialAccountCanBeLinked(
    globalUserId: string | null,
    provider: SocialAuthProvider,
    providerUserId?: string,
  ) {
    const normalizedProviderUserId =
      this.normalizeOptionalString(providerUserId);

    if (!normalizedProviderUserId) {
      return;
    }

    const existingProviderAccount =
      await this.controlPlanePrisma.globalUserSocialAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: normalizedProviderUserId,
          },
        },
        select: {
          id: true,
          globalUserId: true,
        },
      });

    if (
      existingProviderAccount &&
      existingProviderAccount.globalUserId !== globalUserId
    ) {
      throw new BadRequestException(
        'Esta conta social ja esta conectada a outro usuario.',
      );
    }

    if (!globalUserId) {
      return;
    }

    const existingUserProvider =
      await this.controlPlanePrisma.globalUserSocialAccount.findUnique({
        where: {
          globalUserId_provider: {
            globalUserId,
            provider,
          },
        },
        select: {
          providerUserId: true,
        },
      });

    if (
      existingUserProvider &&
      existingUserProvider.providerUserId !== normalizedProviderUserId
    ) {
      throw new BadRequestException(
        'Ja existe outra conta deste provedor conectada a este usuario.',
      );
    }
  }

  private async linkSocialAccount(
    globalUserId: string,
    provider: SocialAuthProvider,
    providerUserId?: string | null,
    email?: string | null,
    touchLastUsedAt = false,
  ): Promise<GlobalUserSocialAccount | null> {
    const normalizedProviderUserId =
      this.normalizeOptionalString(providerUserId);

    if (!normalizedProviderUserId) {
      return null;
    }

    const normalizedEmail = this.normalizeOptionalString(email);
    const existingProviderAccount =
      await this.controlPlanePrisma.globalUserSocialAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: normalizedProviderUserId,
          },
        },
      });

    if (
      existingProviderAccount &&
      existingProviderAccount.globalUserId !== globalUserId
    ) {
      throw new BadRequestException(
        'Esta conta social ja esta conectada a outro usuario.',
      );
    }

    const existingUserProvider =
      await this.controlPlanePrisma.globalUserSocialAccount.findUnique({
        where: {
          globalUserId_provider: {
            globalUserId,
            provider,
          },
        },
      });

    if (
      existingUserProvider &&
      existingUserProvider.providerUserId !== normalizedProviderUserId
    ) {
      throw new BadRequestException(
        'Ja existe outra conta deste provedor conectada a este usuario.',
      );
    }

    const baseData = {
      email: normalizedEmail,
      ...(touchLastUsedAt ? { lastUsedAt: new Date() } : {}),
    };

    if (existingProviderAccount) {
      return this.controlPlanePrisma.globalUserSocialAccount.update({
        where: {
          id: existingProviderAccount.id,
        },
        data: baseData,
      });
    }

    if (existingUserProvider) {
      return this.controlPlanePrisma.globalUserSocialAccount.update({
        where: {
          id: existingUserProvider.id,
        },
        data: {
          ...baseData,
          providerUserId: normalizedProviderUserId,
        },
      });
    }

    return this.controlPlanePrisma.globalUserSocialAccount.create({
      data: {
        globalUserId,
        provider,
        providerUserId: normalizedProviderUserId,
        ...baseData,
      },
    });
  }

  private async resolveSocialConnections(globalUserId: string) {
    const accounts =
      await this.controlPlanePrisma.globalUserSocialAccount.findMany({
        where: {
          globalUserId,
        },
        select: {
          provider: true,
        },
      });

    return {
      google: accounts.some(
        (account) => account.provider === SocialAuthProvider.GOOGLE,
      ),
      facebook: accounts.some(
        (account) => account.provider === SocialAuthProvider.FACEBOOK,
      ),
    };
  }

  private async verifySocialToken(
    provider: 'google' | 'facebook',
    token: string,
  ): Promise<VerifiedSocialProfile> {
    switch (provider) {
      case 'google':
        return this.verifyGoogleToken(token);
      case 'facebook':
        return this.verifyFacebookToken(token);
      default:
        throw new BadRequestException('Provedor nao suportado.');
    }
  }

  private async verifyGoogleToken(
    token: string,
  ): Promise<VerifiedSocialProfile> {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      throw new UnauthorizedException('Token do Google invalido ou expirado.');
    }

    const data = (await response.json()) as {
      email?: string;
      name?: string;
      picture?: string;
      sub?: string;
      email_verified?: boolean;
    };

    if (!data.email) {
      throw new BadRequestException(
        'Nao foi possivel obter o email da conta Google.',
      );
    }

    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
      providerUserId: data.sub,
    };
  }

  private async verifyFacebookToken(
    token: string,
  ): Promise<VerifiedSocialProfile> {
    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.width(256).height(256)&access_token=${encodeURIComponent(token)}`,
    );

    if (!response.ok) {
      throw new UnauthorizedException(
        'Token do Facebook invalido ou expirado.',
      );
    }

    const data = (await response.json()) as {
      id?: string;
      email?: string;
      name?: string;
      picture?: {
        data?: {
          url?: string;
        };
      };
    };

    if (!data.id) {
      throw new BadRequestException(
        'Nao foi possivel identificar a conta Facebook autenticada.',
      );
    }

    return {
      email: data.email,
      name: data.name,
      picture: data.picture?.data?.url,
      providerUserId: data.id,
    };
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const email = dto.email.toLowerCase().trim();
    let globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        email,
      },
    });

    if (!globalUser) {
      globalUser = await this.bootstrapLegacyIdentityFromTenant(
        email,
        dto.password,
      );
    }

    if (
      !globalUser ||
      globalUser.deletedAt !== null ||
      globalUser.status !== GlobalUserStatus.ACTIVE
    ) {
      await this.controlPlaneAuditService.log({
        action: PlatformAuditAction.LOGIN_FAILED,
        entityType: 'global_user',
        entityId: globalUser?.id ?? null,
        metadata: {
          email,
          reason: 'user_not_found_or_inactive',
        },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const matches = await bcrypt.compare(dto.password, globalUser.passwordHash);
    if (!matches) {
      await this.controlPlaneAuditService.log({
        actorId: globalUser.id,
        action: PlatformAuditAction.LOGIN_FAILED,
        entityType: 'global_user',
        entityId: globalUser.id,
        metadata: {
          email,
          reason: 'invalid_password',
        },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const memberships =
      await this.controlPlanePrisma.companyMembership.findMany({
        where: {
          globalUserId: globalUser.id,
          status: MembershipStatus.ACTIVE,
          company: {
            status: CompanyStatus.ACTIVE,
          },
        },
        include: {
          company: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

    const membership = memberships[0] ?? null;
    if (!membership && !this.hasPlatformAccess(globalUser.platformRole)) {
      throw new UnauthorizedException('Usuario sem empresa ativa vinculada.');
    }

    await this.controlPlanePrisma.globalUser.update({
      where: { id: globalUser.id },
      data: { lastLoginAt: new Date() },
    });

    await this.controlPlaneAuditService.log({
      actorId: globalUser.id,
      action: PlatformAuditAction.LOGIN,
      entityType: 'global_user',
      entityId: globalUser.id,
      metadata: {
        companyId: membership?.companyId ?? null,
      },
      ipAddress,
      userAgent,
    });

    return this.issueSession(globalUser, membership, {
      userAgent,
      ipAddress,
    });
  }

  async refresh(dto: RefreshDto, userAgent?: string, ipAddress?: string) {
    const hashedToken = hashOpaqueToken(dto.refreshToken);
    const existingToken =
      await this.controlPlanePrisma.globalRefreshToken.findUnique({
        where: { tokenHash: hashedToken },
        include: {
          globalUser: true,
        },
      });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    if (
      existingToken.globalUser.status !== GlobalUserStatus.ACTIVE ||
      existingToken.globalUser.deletedAt
    ) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    await this.controlPlanePrisma.globalRefreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    let membership: SessionMembership | null = null;

    if (existingToken.companyId) {
      const membershipRecord =
        await this.controlPlanePrisma.companyMembership.findFirst({
          where: {
            globalUserId: existingToken.globalUserId,
            companyId: existingToken.companyId,
            status: MembershipStatus.ACTIVE,
            company: {
              status: CompanyStatus.ACTIVE,
            },
          },
          include: {
            company: true,
          },
        });
      membership =
        membershipRecord ??
        (await this.getDefaultMembership(existingToken.globalUserId));
    } else {
      membership = await this.getDefaultMembership(existingToken.globalUserId);
    }

    if (
      !membership &&
      !this.hasPlatformAccess(existingToken.globalUser.platformRole)
    ) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    return this.issueSession(existingToken.globalUser, membership, {
      userAgent,
      ipAddress,
    });
  }

  async switchCompany(user: CurrentAuthUser, dto: SwitchCompanyDto) {
    const globalUserId = user.globalUserId ?? user.sub;
    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        id: globalUserId,
      },
    });

    if (!globalUser || globalUser.status !== GlobalUserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    const membership =
      await this.controlPlanePrisma.companyMembership.findFirst({
        where: {
          globalUserId: globalUser.id,
          companyId: dto.companyId,
          status: MembershipStatus.ACTIVE,
          company: {
            status: CompanyStatus.ACTIVE,
          },
        },
        include: {
          company: true,
        },
      });

    if (!membership) {
      throw new NotFoundException('Empresa nao encontrada para este usuario.');
    }

    await this.controlPlanePrisma.companyMembership.updateMany({
      where: {
        globalUserId: globalUser.id,
      },
      data: {
        isDefault: false,
      },
    });

    await this.controlPlanePrisma.companyMembership.update({
      where: {
        id: membership.id,
      },
      data: {
        isDefault: true,
      },
    });

    return this.issueSession(globalUser, membership);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.controlPlanePrisma.globalRefreshToken.updateMany({
        where: {
          globalUserId: userId,
          tokenHash: hashOpaqueToken(refreshToken),
        },
        data: { revokedAt: new Date() },
      });
      return { success: true };
    }

    await this.controlPlanePrisma.globalRefreshToken.updateMany({
      where: { globalUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.controlPlanePrisma.globalUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || user.deletedAt) {
      return { success: true };
    }

    const token = generateSecureToken(20);
    await this.controlPlanePrisma.globalPasswordResetToken.create({
      data: {
        globalUserId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    this.logger.log(`Password reset token for ${user.email}: ${token}`);

    return {
      success: true,
      devToken:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? undefined
          : token,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const resetToken =
      await this.controlPlanePrisma.globalPasswordResetToken.findUnique({
        where: { tokenHash: hashOpaqueToken(dto.token) },
        include: {
          globalUser: true,
        },
      });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException(
        'Token de redefinicao invalido ou expirado.',
      );
    }

    const newPasswordHash = await bcrypt.hash(dto.password, 10);

    await this.controlPlanePrisma.$transaction([
      this.controlPlanePrisma.globalUser.update({
        where: { id: resetToken.globalUserId },
        data: { passwordHash: newPasswordHash },
      }),
      this.controlPlanePrisma.globalPasswordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.controlPlanePrisma.globalRefreshToken.updateMany({
        where: { globalUserId: resetToken.globalUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const memberships =
      await this.controlPlanePrisma.companyMembership.findMany({
        where: {
          globalUserId: resetToken.globalUserId,
          status: MembershipStatus.ACTIVE,
        },
      });

    for (const membership of memberships) {
      await this.prisma.runWithTenant(membership.companyId, async () => {
        await this.prisma.user.updateMany({
          where: {
            workspaceId: membership.companyId,
            OR: [
              {
                globalUserId: resetToken.globalUserId,
              },
              {
                email: resetToken.globalUser.email,
              },
            ],
          },
          data: {
            passwordHash: newPasswordHash,
          },
        });
      });
    }

    return { success: true };
  }

  async me(authUser: CurrentAuthUser) {
    const globalUserId = authUser.globalUserId ?? authUser.sub;
    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: { id: globalUserId },
    });

    if (!globalUser || globalUser.deletedAt) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const socialConnections = await this.resolveSocialConnections(
      globalUser.id,
    );

    const memberships =
      await this.controlPlanePrisma.companyMembership.findMany({
        where: {
          globalUserId: globalUser.id,
          status: MembershipStatus.ACTIVE,
          company: {
            status: CompanyStatus.ACTIVE,
          },
        },
        include: {
          company: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

    const selectedMembership =
      memberships.find(
        (membership) => membership.companyId === authUser.companyId,
      ) ??
      memberships[0] ??
      null;

    if (!selectedMembership) {
      return {
        id: globalUser.id,
        name: globalUser.name,
        email: globalUser.email,
        avatarUrl: this.resolveAuthUserAvatarUrl(globalUser),
        role: Role.ADMIN,
        normalizedRole: normalizeRole(Role.ADMIN),
        title: 'Administrador da plataforma',
        status: globalUser.status,
        permissions: [],
        permissionMap: {},
        workspace: {
          id: '',
          name: 'Plataforma',
          slug: 'platform',
          companyName: 'AutosZap Platform',
        },
        companies: memberships.map((membership) => ({
          id: membership.company.id,
          name: membership.company.name,
          slug: membership.company.slug,
          status: membership.company.status,
          tenantRole: membership.tenantRole,
          isDefault: membership.isDefault,
        })),
        platform: {
          role: globalUser.platformRole,
          isPlatformAdmin: this.hasPlatformAccess(globalUser.platformRole),
        },
        socialConnections,
      };
    }

    const tenantUser = await this.prisma.user.findFirst({
      where: {
        workspaceId: selectedMembership.company.workspaceId,
        OR: [
          {
            globalUserId: globalUser.id,
          },
          {
            email: globalUser.email,
          },
        ],
      },
      include: {
        workspace: {
          include: {
            instances: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
                status: true,
                profilePictureUrl: true,
                lastSyncAt: true,
                updatedAt: true,
              },
              orderBy: [
                {
                  lastSyncAt: 'desc',
                },
                {
                  updatedAt: 'desc',
                },
              ],
            },
          },
        },
        workspaceRole: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!tenantUser) {
      throw new NotFoundException(
        'Usuario da empresa nao encontrado. Reexecute o provisionamento do tenant.',
      );
    }

    if (!tenantUser.globalUserId) {
      await this.prisma.user.update({
        where: {
          id: tenantUser.id,
        },
        data: {
          globalUserId: globalUser.id,
        },
      });
    }

    const permissionSnapshot =
      await this.accessControlService.getUserPermissions(
        tenantUser.id,
        tenantUser.workspaceId,
      );
    const headerInstance =
      tenantUser.workspace.instances.find(
        (instance) =>
          instance.status === 'CONNECTED' && instance.profilePictureUrl,
      ) ??
      tenantUser.workspace.instances.find(
        (instance) => instance.profilePictureUrl,
      ) ??
      null;

    return {
      id: tenantUser.id,
      name: tenantUser.name,
      email: tenantUser.email,
      avatarUrl: this.resolveAuthUserAvatarUrl(
        globalUser,
        tenantUser.avatarUrl ?? null,
      ),
      role: tenantUser.role,
      normalizedRole: normalizeRole(tenantUser.role),
      title: tenantUser.title,
      workspaceRoleId: tenantUser.workspaceRoleId,
      workspaceRole: tenantUser.workspaceRole,
      status: tenantUser.status,
      permissions: Object.entries(permissionSnapshot.permissionMap)
        .filter(([, allowed]) => allowed)
        .map(([permission]) => permission),
      permissionMap: permissionSnapshot.permissionMap,
      workspace: {
        id: tenantUser.workspace.id,
        name: tenantUser.workspace.name,
        slug: tenantUser.workspace.slug,
        companyName: tenantUser.workspace.companyName,
        instanceProfilePictureUrl: headerInstance
          ? `/api/proxy/instances/${headerInstance.id}/profile-picture`
          : null,
      },
      companies: memberships.map((membership) => ({
        id: membership.company.id,
        name: membership.company.name,
        slug: membership.company.slug,
        status: membership.company.status,
        tenantRole: membership.tenantRole,
        isDefault: membership.isDefault,
      })),
      platform: {
        role: globalUser.platformRole,
        isPlatformAdmin: this.hasPlatformAccess(globalUser.platformRole),
      },
      companyId: selectedMembership.companyId,
      membershipId: selectedMembership.id,
      globalUserId: globalUser.id,
      socialConnections,
    };
  }

  private async issueSession(
    globalUser: GlobalUser,
    membership: SessionMembership | null,
    meta?: {
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const tenantRole = this.mapTenantRoleToTenantRoleEnum(
      membership?.tenantRole ?? TenantRole.ADMIN,
    );
    const workspaceId = membership?.company.workspaceId ?? '';
    const tenantUserId = membership
      ? await this.resolveTenantUserId(globalUser, membership)
      : null;
    const subjectId = tenantUserId ?? globalUser.id;

    const payload: AuthUserPayload = {
      sub: subjectId,
      globalUserId: globalUser.id,
      email: globalUser.email,
      name: globalUser.name,
      workspaceId,
      role: tenantRole,
      companyId: membership?.companyId,
      membershipId: membership?.id,
      platformRole: globalUser.platformRole ?? undefined,
    };

    const accessExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshToken = generateSecureToken(32);
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + parseDurationToMs(refreshExpiresIn),
    );

    const [accessToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret:
          this.configService.get<string>('JWT_ACCESS_SECRET') ??
          'autoszap-access-secret',
        expiresIn: accessExpiresIn as never,
      }),
      this.controlPlanePrisma.globalRefreshToken.create({
        data: {
          globalUserId: globalUser.id,
          companyId: membership?.companyId ?? null,
          tokenHash: refreshTokenHash,
          expiresAt: refreshExpiresAt,
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: subjectId,
        name: globalUser.name,
        email: globalUser.email,
        role: tenantRole,
        workspaceId,
        companyId: membership?.companyId ?? null,
        globalUserId: globalUser.id,
        platformRole: globalUser.platformRole ?? null,
        isPlatformAdmin: this.hasPlatformAccess(globalUser.platformRole),
      },
      workspace: membership
        ? {
            id: membership.company.workspaceId,
            name: membership.company.name,
            slug: membership.company.slug,
          }
        : undefined,
    };
  }

  private async resolveTenantUserId(
    globalUser: GlobalUser,
    membership: SessionMembership,
  ): Promise<string> {
    const tenantUser = await this.prisma.runWithTenant(
      membership.companyId,
      async () =>
        this.prisma.user.findFirst({
          where: {
            workspaceId: membership.company.workspaceId,
            deletedAt: null,
            OR: [
              {
                globalUserId: globalUser.id,
              },
              {
                email: globalUser.email,
              },
            ],
          },
          select: {
            id: true,
          },
        }),
    );

    if (!tenantUser) {
      throw new NotFoundException(
        'Usuario da empresa nao encontrado. Reexecute o provisionamento do tenant.',
      );
    }

    return tenantUser.id;
  }

  private async getDefaultMembership(
    globalUserId: string,
  ): Promise<SessionMembership | null> {
    return this.controlPlanePrisma.companyMembership.findFirst({
      where: {
        globalUserId,
        status: MembershipStatus.ACTIVE,
        company: {
          status: CompanyStatus.ACTIVE,
        },
      },
      include: {
        company: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private mapTenantRoleToTenantRoleEnum(role: TenantRole): Role {
    if (role === TenantRole.ADMIN) return Role.ADMIN;
    if (role === TenantRole.MANAGER) return Role.MANAGER;
    if (role === TenantRole.AGENT) return Role.AGENT;
    return Role.SELLER;
  }

  private async generateUniqueCompanySlug(companyName: string) {
    const baseSlug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42);
    const normalizedBaseSlug = baseSlug || 'company';
    let suffix = 0;

    while (suffix < 50) {
      const candidate =
        suffix === 0
          ? normalizedBaseSlug
          : `${normalizedBaseSlug}-${suffix + 1}`;
      const existing = await this.controlPlanePrisma.company.findUnique({
        where: {
          slug: candidate,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }

      suffix += 1;
    }

    return `${normalizedBaseSlug}-${Date.now().toString().slice(-6)}`;
  }

  private async bootstrapLegacyIdentityFromTenant(
    email: string,
    plainPassword: string,
  ) {
    const tenantIds = await this.tenantConnectionService.listActiveTenantIds();

    if (!tenantIds.length) {
      tenantIds.push('legacy-shared-bootstrap');
    }

    for (const tenantId of tenantIds) {
      const candidate = await this.prisma.runWithTenant(tenantId, async () => {
        const user = await this.prisma.user.findUnique({
          where: {
            email,
          },
        });

        if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          plainPassword,
          user.passwordHash,
        );

        if (!passwordMatches) {
          return null;
        }

        const workspace = await this.prisma.workspace.findUnique({
          where: {
            id: user.workspaceId,
          },
        });

        if (!workspace) {
          return null;
        }

        return {
          user,
          workspace,
        };
      });

      if (!candidate) {
        continue;
      }

      const globalUser = await this.controlPlanePrisma.globalUser.upsert({
        where: {
          email,
        },
        update: {
          name: candidate.user.name,
          passwordHash: candidate.user.passwordHash,
          status: GlobalUserStatus.ACTIVE,
          deletedAt: null,
          blockedAt: null,
        },
        create: {
          email,
          name: candidate.user.name,
          passwordHash: candidate.user.passwordHash,
          status: GlobalUserStatus.ACTIVE,
        },
      });

      const companySlug = await this.generateUniqueCompanySlug(
        candidate.workspace.slug || candidate.workspace.name,
      );
      const company = await this.controlPlanePrisma.company.upsert({
        where: {
          id: candidate.workspace.id,
        },
        update: {
          workspaceId: candidate.workspace.id,
          name: candidate.workspace.companyName || candidate.workspace.name,
          slug: companySlug,
          status: CompanyStatus.ACTIVE,
        },
        create: {
          id: candidate.workspace.id,
          workspaceId: candidate.workspace.id,
          name: candidate.workspace.companyName || candidate.workspace.name,
          slug: companySlug,
          status: CompanyStatus.ACTIVE,
        },
      });

      await this.controlPlanePrisma.companyMembership.upsert({
        where: {
          companyId_globalUserId: {
            companyId: company.id,
            globalUserId: globalUser.id,
          },
        },
        update: {
          tenantRole: this.mapTenantRole(candidate.user.role),
          status: MembershipStatus.ACTIVE,
          isDefault: true,
        },
        create: {
          companyId: company.id,
          globalUserId: globalUser.id,
          tenantRole: this.mapTenantRole(candidate.user.role),
          status: MembershipStatus.ACTIVE,
          isDefault: true,
        },
      });

      await this.prisma.runWithTenant(tenantId, async () => {
        await this.prisma.user.update({
          where: {
            id: candidate.user.id,
          },
          data: {
            globalUserId: globalUser.id,
          },
        });
      });

      const sharedDatabaseUrl = this.configService.get<string>('DATABASE_URL');
      const encryptedSharedDatabaseUrl = sharedDatabaseUrl
        ? this.cryptoService.encrypt(sharedDatabaseUrl)
        : null;

      // A URL compartilhada so deve ser persistida quando o bootstrap veio do
      // tenant legado. Em tenants dedicados, sobrescrever esta configuracao
      // pode redirecionar a empresa para o banco errado.
      if (
        tenantId === 'legacy-shared-bootstrap' &&
        encryptedSharedDatabaseUrl
      ) {
        await this.controlPlanePrisma.tenantDatabase.upsert({
          where: {
            companyId: company.id,
          },
          update: {
            status: TenantDatabaseStatus.READY,
            connectionUrlEncrypted: encryptedSharedDatabaseUrl,
          },
          create: {
            companyId: company.id,
            databaseName: 'legacy-shared',
            connectionUrlEncrypted: encryptedSharedDatabaseUrl,
            status: TenantDatabaseStatus.READY,
          },
        });
      }

      this.logger.warn(
        `Usuario ${email} auto-migrado para control plane a partir do tenant ${tenantId}.`,
      );

      return globalUser;
    }

    return null;
  }

  private hasPlatformAccess(role: PlatformRole | null | undefined) {
    return role === PlatformRole.SUPER_ADMIN || role === PlatformRole.SUPPORT;
  }

  private isPublicSignupEnabled() {
    const rawValue = (
      this.configService.get<string>('ALLOW_PUBLIC_SIGNUP') ?? 'true'
    )
      .trim()
      .toLowerCase();

    return !['false', '0', 'no', 'off'].includes(rawValue);
  }

  private mapTenantRole(role: Role): TenantRole {
    if (role === Role.ADMIN) return TenantRole.ADMIN;
    if (role === Role.MANAGER) return TenantRole.MANAGER;
    if (role === Role.AGENT) return TenantRole.AGENT;
    return TenantRole.SELLER;
  }
}
