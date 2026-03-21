import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  CompanyStatus,
  GlobalUserStatus,
  MembershipStatus,
  PlatformRole,
  TenantRole,
} from '@autoszap/control-plane-client';
import { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { PrismaService } from '../../common/prisma/prisma.service';

type JwtPayload = {
  sub: string;
  globalUserId?: string;
  email: string;
  name: string;
  workspaceId: string;
  role: Role;
  companyId?: string;
  membershipId?: string;
  platformRole?: PlatformRole;
};

type JwtRequestLike = {
  method?: string;
  query?: Record<string, unknown>;
};

export function extractAccessTokenFromReadonlyQuery(
  request?: JwtRequestLike | null,
) {
  if (!request) {
    return null;
  }

  const method = request.method?.toUpperCase();

  if (method && method !== 'GET' && method !== 'HEAD') {
    return null;
  }

  const rawValue = request.query?.accessToken;

  if (typeof rawValue === 'string' && rawValue.trim()) {
    return rawValue.trim();
  }

  if (Array.isArray(rawValue)) {
    const firstString = rawValue.find(
      (value): value is string =>
        typeof value === 'string' && Boolean(value.trim()),
    );

    return firstString?.trim() ?? null;
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractAccessTokenFromReadonlyQuery,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ??
        'autoszap-access-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const globalUserId = payload.globalUserId ?? payload.sub;
    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        id: globalUserId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        deletedAt: true,
        platformRole: true,
      },
    });

    if (
      !globalUser ||
      globalUser.status !== GlobalUserStatus.ACTIVE ||
      globalUser.deletedAt
    ) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    let membership = payload.companyId
      ? await this.controlPlanePrisma.companyMembership.findFirst({
          where: {
            id: payload.membershipId ?? undefined,
            companyId: payload.companyId,
            globalUserId: globalUser.id,
            status: MembershipStatus.ACTIVE,
            company: {
              status: CompanyStatus.ACTIVE,
            },
          },
          include: {
            company: true,
          },
        })
      : await this.controlPlanePrisma.companyMembership.findFirst({
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

    if (!membership) {
      membership = await this.controlPlanePrisma.companyMembership.findFirst({
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
    }

    if (!membership && globalUser.platformRole == null) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    let subjectId = payload.sub;
    if (membership && payload.sub === globalUser.id) {
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
        throw new UnauthorizedException('Sessao invalida ou expirada.');
      }

      subjectId = tenantUser.id;
    }

    return {
      sub: membership ? subjectId : globalUser.id,
      globalUserId: globalUser.id,
      email: globalUser.email,
      name: globalUser.name,
      role: this.mapTenantRoleToRole(membership?.tenantRole),
      workspaceId: membership?.company.workspaceId ?? '',
      companyId: membership?.companyId,
      membershipId: membership?.id,
      platformRole: globalUser.platformRole ?? undefined,
    } satisfies CurrentAuthUser;
  }

  private mapTenantRoleToRole(role?: TenantRole): CurrentAuthUser['role'] {
    if (role === TenantRole.ADMIN) return 'ADMIN';
    if (role === TenantRole.MANAGER) return 'MANAGER';
    if (role === TenantRole.AGENT) return 'AGENT';
    return 'SELLER';
  }
}
