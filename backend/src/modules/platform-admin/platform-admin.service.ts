import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import {
  CompanyStatus,
  GlobalUserStatus,
  LeadInterestStatus,
  MembershipStatus,
  PlatformRole,
  PlatformAuditAction,
  ProvisioningJobStatus,
  TenantRole,
} from '@autoszap/control-plane-client';
import { ControlPlaneAuditService } from '../control-plane/control-plane-audit.service';
import { TenantProvisioningService } from '../control-plane/tenant-provisioning.service';
import {
  CreatePlatformCompanyDto,
  CreatePlatformUserDto,
  PlatformAuditQueryDto,
  PlatformCompanyListQueryDto,
  PlatformLeadInterestsQueryDto,
  PlatformUsersListQueryDto,
  UpdatePlatformCompanyDto,
  UpdatePlatformLeadInterestDto,
  UpdatePlatformUserDto,
  UpsertMembershipDto,
} from './platform-admin.dto';
import { Role, UserStatus } from '@prisma/client';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly controlPlaneAuditService: ControlPlaneAuditService,
    private readonly tenantProvisioningService: TenantProvisioningService,
    private readonly prisma: PrismaService,
  ) {}

  async getDashboard() {
    const [totalCompanies, activeCompanies, totalUsers, blockedUsers] =
      await Promise.all([
        this.controlPlanePrisma.company.count(),
        this.controlPlanePrisma.company.count({
          where: {
            status: CompanyStatus.ACTIVE,
          },
        }),
        this.controlPlanePrisma.globalUser.count(),
        this.controlPlanePrisma.globalUser.count({
          where: {
            status: GlobalUserStatus.BLOCKED,
          },
        }),
      ]);

    const tenantDatabases =
      await this.controlPlanePrisma.tenantDatabase.findMany({
        select: {
          status: true,
        },
      });
    const provisioningJobs =
      await this.controlPlanePrisma.tenantProvisioningJob.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

    const tenantStatusCount = tenantDatabases.reduce<Record<string, number>>(
      (acc, row) => {
        const status = row.status;
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    const recentFailures = provisioningJobs
      .filter((job) => job.status === ProvisioningJobStatus.FAILED)
      .map((job) => ({
        id: job.id,
        companyId: job.companyId,
        companyName: job.company.name,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      }));

    return {
      totals: {
        companies: totalCompanies,
        activeCompanies,
        inactiveCompanies: totalCompanies - activeCompanies,
        globalUsers: totalUsers,
        blockedUsers,
      },
      provisioning: {
        total: tenantDatabases.length,
        byStatus: tenantStatusCount,
        recentJobs: provisioningJobs,
      },
      securityAlerts: {
        blockedUsers,
        failedProvisioningJobs: recentFailures.length,
        recentFailures,
      },
    };
  }

  async listCompanies(query: PlatformCompanyListQueryDto) {
    const search = query.search?.trim();
    return this.controlPlanePrisma.company.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { workspaceId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        tenantDatabase: true,
        memberships: {
          where: {
            status: MembershipStatus.ACTIVE,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createCompany(actorId: string, dto: CreatePlatformCompanyDto) {
    if (dto.adminPassword !== dto.adminPasswordConfirm) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const companyId = randomUUID();
    const workspaceId = companyId;
    const slug = await this.generateUniqueCompanySlug(dto.slug ?? dto.name);
    const adminEmail = dto.adminEmail.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    const created = await this.controlPlanePrisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          id: companyId,
          workspaceId,
          name: dto.name,
          legalName: dto.legalName,
          slug,
          status: CompanyStatus.ACTIVE,
        },
      });

      const user = await tx.globalUser.upsert({
        where: {
          email: adminEmail,
        },
        update: {
          name: dto.adminName,
          passwordHash,
          status: GlobalUserStatus.ACTIVE,
          blockedAt: null,
          deletedAt: null,
        },
        create: {
          name: dto.adminName,
          email: adminEmail,
          passwordHash,
          status: GlobalUserStatus.ACTIVE,
        },
      });

      const hasActiveMembership = await tx.companyMembership.findFirst({
        where: {
          globalUserId: user.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      const membership = await tx.companyMembership.create({
        data: {
          companyId: company.id,
          globalUserId: user.id,
          tenantRole: TenantRole.ADMIN,
          status: MembershipStatus.ACTIVE,
          isDefault: !hasActiveMembership,
        },
      });

      return {
        company,
        user,
        membership,
      };
    });

    await this.tenantProvisioningService.provisionTenant({
      companyId: created.company.id,
      companyName: created.company.name,
      companySlug: created.company.slug,
      workspaceId: created.company.workspaceId,
      requestedById: actorId,
      admin: {
        globalUserId: created.user.id,
        name: created.user.name,
        email: created.user.email,
        passwordHash: created.user.passwordHash,
      },
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.COMPANY_CREATED,
      entityType: 'company',
      entityId: created.company.id,
      metadata: {
        slug: created.company.slug,
        adminEmail: created.user.email,
      },
    });

    return this.controlPlanePrisma.company.findUnique({
      where: {
        id: created.company.id,
      },
      include: {
        tenantDatabase: true,
      },
    });
  }

  async updateCompany(
    actorId: string,
    companyId: string,
    dto: UpdatePlatformCompanyDto,
  ) {
    const company = await this.controlPlanePrisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    let nextSlug: string | undefined;
    if (dto.slug && dto.slug !== company.slug) {
      nextSlug = await this.generateUniqueCompanySlug(dto.slug, company.id);
    }

    const updated = await this.controlPlanePrisma.company.update({
      where: {
        id: companyId,
      },
      data: {
        name: dto.name ?? company.name,
        legalName: dto.legalName ?? company.legalName,
        slug: nextSlug ?? company.slug,
        status: dto.status ?? company.status,
        deactivatedAt:
          dto.status && dto.status !== CompanyStatus.ACTIVE
            ? new Date()
            : dto.status === CompanyStatus.ACTIVE
              ? null
              : company.deactivatedAt,
      },
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.COMPANY_UPDATED,
      entityType: 'company',
      entityId: companyId,
      metadata: {
        status: updated.status,
      },
    });

    return updated;
  }

  async reprovisionCompany(actorId: string, companyId: string) {
    const company = await this.controlPlanePrisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const membership =
      await this.controlPlanePrisma.companyMembership.findFirst({
        where: {
          companyId,
          tenantRole: TenantRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        include: {
          globalUser: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    await this.tenantProvisioningService.provisionTenant({
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      workspaceId: company.workspaceId,
      requestedById: actorId,
      admin: membership
        ? {
            globalUserId: membership.globalUser.id,
            name: membership.globalUser.name,
            email: membership.globalUser.email,
            passwordHash: membership.globalUser.passwordHash,
          }
        : undefined,
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.COMPANY_PROVISIONED,
      entityType: 'company',
      entityId: company.id,
      metadata: {
        operation: 'reprovision',
      },
    });

    return this.controlPlanePrisma.company.findUnique({
      where: {
        id: company.id,
      },
      include: {
        tenantDatabase: true,
      },
    });
  }

  async listGlobalUsers(query: PlatformUsersListQueryDto) {
    const search = query.search?.trim();
    return this.controlPlanePrisma.globalUser.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        memberships: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createGlobalUser(actorId: string, dto: CreatePlatformUserDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe um usuario com este email.');
    }

    const user = await this.controlPlanePrisma.globalUser.create({
      data: {
        name: dto.name,
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        status: dto.status ?? GlobalUserStatus.ACTIVE,
        platformRole: dto.platformRole ?? null,
      },
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.USER_CREATED,
      entityType: 'global_user',
      entityId: user.id,
      metadata: {
        email: user.email,
      },
    });

    return user;
  }

  async updateGlobalUser(
    actorId: string,
    globalUserId: string,
    dto: UpdatePlatformUserDto,
  ) {
    if (
      dto.password &&
      dto.confirmPassword !== undefined &&
      dto.password !== dto.confirmPassword
    ) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const user = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        id: globalUserId,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario global nao encontrado.');
    }

    const nextPasswordHash =
      dto.password && dto.password.length > 0
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const updated = await this.controlPlanePrisma.globalUser.update({
      where: {
        id: globalUserId,
      },
      data: {
        name: dto.name ?? user.name,
        status: dto.status ?? user.status,
        platformRole:
          dto.platformRole !== undefined ? dto.platformRole : user.platformRole,
        passwordHash: nextPasswordHash ?? user.passwordHash,
        blockedAt:
          dto.status === GlobalUserStatus.BLOCKED
            ? new Date()
            : dto.status === GlobalUserStatus.ACTIVE
              ? null
              : user.blockedAt,
      },
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.USER_UPDATED,
      entityType: 'global_user',
      entityId: updated.id,
      metadata: {
        status: updated.status,
      },
    });

    return updated;
  }

  async upsertMembership(
    actorId: string,
    globalUserId: string,
    dto: UpsertMembershipDto,
  ) {
    const user = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        id: globalUserId,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario global nao encontrado.');
    }

    const company = await this.controlPlanePrisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    if (dto.isDefault) {
      await this.controlPlanePrisma.companyMembership.updateMany({
        where: {
          globalUserId,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const membership = await this.controlPlanePrisma.companyMembership.upsert({
      where: {
        companyId_globalUserId: {
          companyId: company.id,
          globalUserId,
        },
      },
      update: {
        tenantRole: dto.tenantRole ?? TenantRole.SELLER,
        status: dto.status ?? MembershipStatus.ACTIVE,
        isDefault: dto.isDefault ?? false,
      },
      create: {
        companyId: company.id,
        globalUserId,
        tenantRole: dto.tenantRole ?? TenantRole.SELLER,
        status: dto.status ?? MembershipStatus.ACTIVE,
        isDefault: dto.isDefault ?? false,
      },
    });

    if (membership.status === MembershipStatus.ACTIVE) {
      await this.syncTenantUserWithMembership({
        workspaceId: company.workspaceId,
        companyId: company.id,
        globalUser: user,
        tenantRole: membership.tenantRole,
      });
    }

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.MEMBERSHIP_UPDATED,
      entityType: 'company_membership',
      entityId: membership.id,
      metadata: {
        companyId: company.id,
        globalUserId,
        status: membership.status,
      },
    });

    return membership;
  }

  async listAuditLogs(query: PlatformAuditQueryDto) {
    const search = query.search?.trim();
    return this.controlPlanePrisma.platformAuditLog.findMany({
      where: search
        ? {
            OR: [
              { entityType: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });
  }

  async listLeadInterests(query: PlatformLeadInterestsQueryDto) {
    const search = query.search?.trim();
    const orderByCreatedAt = query.sort === 'createdAt_asc' ? 'asc' : 'desc';

    return this.controlPlanePrisma.leadInterest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: {
        createdAt: orderByCreatedAt,
      },
      take: 300,
    });
  }

  async updateLeadInterest(
    actorId: string,
    leadInterestId: string,
    dto: UpdatePlatformLeadInterestDto,
  ) {
    const existing = await this.controlPlanePrisma.leadInterest.findUnique({
      where: {
        id: leadInterestId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Interessado nao encontrado.');
    }

    const now = new Date();
    const updated = await this.controlPlanePrisma.leadInterest.update({
      where: {
        id: leadInterestId,
      },
      data: {
        status: dto.status,
        contactedAt:
          dto.status === LeadInterestStatus.CONTACTED ||
          dto.status === LeadInterestStatus.CONVERTED
            ? existing.contactedAt ?? now
            : existing.contactedAt,
        convertedAt:
          dto.status === LeadInterestStatus.CONVERTED
            ? existing.convertedAt ?? now
            : existing.convertedAt,
        archivedAt:
          dto.status === LeadInterestStatus.ARCHIVED ? now : null,
      },
    });

    await this.controlPlaneAuditService.log({
      actorId,
      action: PlatformAuditAction.SECURITY_EVENT,
      entityType: 'lead_interest',
      entityId: leadInterestId,
      metadata: {
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    });

    return updated;
  }

  async getPlatformMe(globalUserId: string) {
    const user = await this.controlPlanePrisma.globalUser.findUnique({
      where: {
        id: globalUserId,
      },
      include: {
        memberships: {
          include: {
            company: true,
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario global nao encontrado.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      platformRole: user.platformRole,
      isPlatformAdmin:
        user.platformRole === PlatformRole.SUPER_ADMIN ||
        user.platformRole === PlatformRole.SUPPORT,
      memberships: user.memberships,
    };
  }

  private async syncTenantUserWithMembership(payload: {
    workspaceId: string;
    companyId: string;
    globalUser: {
      id: string;
      name: string;
      email: string;
      passwordHash: string;
    };
    tenantRole: TenantRole;
  }) {
    await this.prisma.runWithTenant(payload.companyId, async () => {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          workspaceId: payload.workspaceId,
          OR: [
            {
              globalUserId: payload.globalUser.id,
            },
            {
              email: payload.globalUser.email,
            },
          ],
        },
      });

      const role = this.mapTenantRole(payload.tenantRole);
      const user = existingUser
        ? await this.prisma.user.update({
            where: {
              id: existingUser.id,
            },
            data: {
              globalUserId: payload.globalUser.id,
              name: payload.globalUser.name,
              email: payload.globalUser.email,
              passwordHash: payload.globalUser.passwordHash,
              role,
              status: UserStatus.ACTIVE,
              deletedAt: null,
            },
          })
        : await this.prisma.user.create({
            data: {
              workspaceId: payload.workspaceId,
              globalUserId: payload.globalUser.id,
              name: payload.globalUser.name,
              email: payload.globalUser.email,
              passwordHash: payload.globalUser.passwordHash,
              role,
              status: UserStatus.ACTIVE,
            },
          });

      await this.prisma.teamMember.upsert({
        where: {
          workspaceId_email: {
            workspaceId: payload.workspaceId,
            email: payload.globalUser.email,
          },
        },
        update: {
          userId: user.id,
          name: user.name,
          role: user.role,
          status: user.status,
          deactivatedAt: null,
        },
        create: {
          workspaceId: payload.workspaceId,
          userId: user.id,
          invitedById: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      });
    });
  }

  private mapTenantRole(role: TenantRole): Role {
    if (role === TenantRole.ADMIN) return Role.ADMIN;
    if (role === TenantRole.MANAGER) return Role.MANAGER;
    if (role === TenantRole.AGENT) return Role.AGENT;
    return Role.SELLER;
  }

  private async generateUniqueCompanySlug(
    rawValue: string,
    ignoredCompanyId?: string,
  ) {
    const baseSlug = rawValue
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
      });

      if (!existing || existing.id === ignoredCompanyId) {
        return candidate;
      }

      suffix += 1;
    }

    return `${normalizedBaseSlug}-${Date.now().toString().slice(-6)}`;
  }
}
