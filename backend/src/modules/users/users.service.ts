import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { UserAvatarStorageService } from './user-avatar-storage.service';

type WorkspaceCompanyProfile = {
  legalName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  district: string | null;
  city: string | null;
  stateCode: string | null;
  zipCode: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly userAvatarStorageService: UserAvatarStorageService,
  ) {}

  async list(workspaceId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        title: true,
        avatarUrl: true,
        globalUserId: true,
      },
    });

    const globalUserIds = Array.from(
      new Set(
        users
          .map((user) => user.globalUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const globalUsers =
      globalUserIds.length > 0
        ? await this.controlPlanePrisma.globalUser.findMany({
            where: {
              id: {
                in: globalUserIds,
              },
            },
            select: {
              id: true,
              avatarStoragePath: true,
              avatarUrl: true,
              updatedAt: true,
            },
          })
        : [];
    const globalUserMap = new Map(
      globalUsers.map((globalUser) => [globalUser.id, globalUser]),
    );

    return users.map(({ globalUserId, avatarUrl, ...user }) => ({
      ...user,
      avatarUrl: this.resolveWorkspaceUserAvatarUrl(
        user.id,
        globalUserId ? (globalUserMap.get(globalUserId) ?? null) : null,
        avatarUrl,
      ),
    }));
  }

  async updateProfile(
    userId: string,
    workspaceId: string,
    payload: { name?: string; title?: string; email?: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (payload.email && payload.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: payload.email.toLowerCase() },
      });

      if (existing) {
        throw new BadRequestException('Ja existe um usuario com este email.');
      }

      const existingGlobal =
        await this.controlPlanePrisma.globalUser.findUnique({
          where: { email: payload.email.toLowerCase() },
        });

      if (
        existingGlobal &&
        existingGlobal.id !== user.globalUserId &&
        existingGlobal.deletedAt === null
      ) {
        throw new BadRequestException('Ja existe um usuario com este email.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: payload.name ?? user.name,
        title: payload.title ?? user.title,
        email: payload.email?.toLowerCase() ?? user.email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        title: true,
      },
    });

    if (user.globalUserId) {
      await this.controlPlanePrisma.globalUser.update({
        where: {
          id: user.globalUserId,
        },
        data: {
          name: updated.name,
          email: updated.email,
        },
      });
    }

    return updated;
  }

  async updateProfileAvatar(
    userId: string,
    workspaceId: string,
    globalUserId: string,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)) {
      throw new BadRequestException(
        'Use uma imagem JPG, PNG ou WEBP para o avatar.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId, deletedAt: null },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: { id: globalUserId },
      select: {
        id: true,
        avatarStoragePath: true,
      },
    });

    if (!globalUser) {
      throw new NotFoundException('Usuario global nao encontrado.');
    }

    const savedAvatar = await this.userAvatarStorageService.save(
      globalUser.id,
      file,
    );
    const avatarUrl = this.buildProfileAvatarUrl();

    await this.controlPlanePrisma.globalUser.update({
      where: { id: globalUser.id },
      data: {
        avatarStoragePath: savedAvatar.storagePath,
        avatarUrl,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl,
      },
    });

    if (
      globalUser.avatarStoragePath &&
      globalUser.avatarStoragePath !== savedAvatar.storagePath
    ) {
      await this.userAvatarStorageService.delete(globalUser.avatarStoragePath);
    }

    return {
      avatarUrl,
    };
  }

  async getProfileAvatar(
    userId: string,
    workspaceId: string,
    globalUserId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: { id: globalUserId },
      select: {
        avatarStoragePath: true,
      },
    });

    if (!globalUser?.avatarStoragePath) {
      throw new NotFoundException(
        'O usuario autenticado nao possui foto de perfil enviada.',
      );
    }

    const buffer = await this.userAvatarStorageService.read(
      globalUser.avatarStoragePath,
    );

    return {
      buffer,
      mimeType: this.userAvatarStorageService.getMimeType(
        globalUser.avatarStoragePath,
      ),
    };
  }

  async getUserAvatar(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId, deletedAt: null },
      select: {
        id: true,
        globalUserId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (!user.globalUserId) {
      throw new NotFoundException(
        'O usuario informado nao possui avatar salvo.',
      );
    }

    const globalUser = await this.controlPlanePrisma.globalUser.findUnique({
      where: { id: user.globalUserId },
      select: {
        avatarStoragePath: true,
      },
    });

    if (!globalUser?.avatarStoragePath) {
      throw new NotFoundException(
        'O usuario informado nao possui avatar salvo.',
      );
    }

    const buffer = await this.userAvatarStorageService.read(
      globalUser.avatarStoragePath,
    );

    return {
      buffer,
      mimeType: this.userAvatarStorageService.getMimeType(
        globalUser.avatarStoragePath,
      ),
    };
  }

  async changePassword(
    userId: string,
    workspaceId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!matches) {
      throw new BadRequestException('Senha atual invalida.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    if (user.globalUserId) {
      await this.controlPlanePrisma.globalUser.update({
        where: {
          id: user.globalUserId,
        },
        data: {
          passwordHash: hashedPassword,
        },
      });
    }

    return { success: true };
  }

  async getWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    const companyProfile = this.readWorkspaceCompanyProfile(workspace.settings);

    return {
      ...workspace,
      ...companyProfile,
    };
  }

  async updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string;
      companyName?: string;
      legalName?: string;
      cnpj?: string;
      stateRegistration?: string;
      phone?: string;
      email?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      district?: string;
      city?: string;
      stateCode?: string;
      zipCode?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    const currentSettings = this.asObject(workspace.settings);
    const currentCompanyProfile = this.readWorkspaceCompanyProfile(
      workspace.settings,
    );
    const nextCompanyProfile = this.buildWorkspaceCompanyProfile(
      currentCompanyProfile,
      payload,
    );
    const nextSettings = {
      ...currentSettings,
      ...(payload.settings ? this.asObject(payload.settings) : {}),
      companyProfile: nextCompanyProfile,
    };

    const updatedWorkspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: payload.name ?? workspace.name,
        companyName: payload.companyName ?? workspace.companyName,
        settings: nextSettings as Prisma.InputJsonValue | undefined,
      },
    });

    await this.controlPlanePrisma.company.updateMany({
      where: {
        workspaceId,
      },
      data: {
        name: payload.companyName ?? workspace.companyName,
        legalName: nextCompanyProfile.legalName,
      },
    });

    return {
      ...updatedWorkspace,
      ...nextCompanyProfile,
    };
  }

  private buildProfileAvatarUrl() {
    return `/api/proxy/users/profile/avatar?v=${Date.now()}`;
  }

  private resolveWorkspaceUserAvatarUrl(
    userId: string,
    globalUser?: {
      avatarStoragePath: string | null;
      avatarUrl: string | null;
      updatedAt: Date;
    } | null,
    fallback?: string | null,
  ) {
    if (globalUser?.avatarStoragePath) {
      return this.buildWorkspaceUserAvatarUrl(userId, globalUser.updatedAt);
    }

    return globalUser?.avatarUrl ?? fallback ?? null;
  }

  private buildWorkspaceUserAvatarUrl(
    userId: string,
    cacheKey?: string | number | Date | null,
  ) {
    const normalizedCacheKey =
      cacheKey instanceof Date ? cacheKey.getTime() : cacheKey;

    if (!normalizedCacheKey) {
      return `/api/proxy/users/${userId}/avatar`;
    }

    return `/api/proxy/users/${userId}/avatar?v=${encodeURIComponent(
      String(normalizedCacheKey),
    )}`;
  }

  private asObject(value: unknown) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return {} as Record<string, unknown>;
    }

    return value as Record<string, unknown>;
  }

  private readWorkspaceCompanyProfile(
    settings: Prisma.JsonValue | null | undefined,
  ): WorkspaceCompanyProfile {
    const root = this.asObject(settings);
    const profile = this.asObject(root.companyProfile);

    return {
      legalName: this.readOptionalString(profile.legalName),
      cnpj: this.readOptionalString(profile.cnpj),
      stateRegistration: this.readOptionalString(profile.stateRegistration),
      phone: this.readOptionalString(profile.phone),
      email: this.readOptionalString(profile.email),
      website: this.readOptionalString(profile.website),
      addressLine1: this.readOptionalString(profile.addressLine1),
      addressLine2: this.readOptionalString(profile.addressLine2),
      district: this.readOptionalString(profile.district),
      city: this.readOptionalString(profile.city),
      stateCode: this.readOptionalString(profile.stateCode),
      zipCode: this.readOptionalString(profile.zipCode),
    };
  }

  private buildWorkspaceCompanyProfile(
    current: WorkspaceCompanyProfile,
    payload: {
      legalName?: string;
      cnpj?: string;
      stateRegistration?: string;
      phone?: string;
      email?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      district?: string;
      city?: string;
      stateCode?: string;
      zipCode?: string;
    },
  ): WorkspaceCompanyProfile {
    return {
      legalName: this.normalizeOptionalText(
        payload.legalName,
        current.legalName,
      ),
      cnpj: this.normalizeCnpj(payload.cnpj, current.cnpj),
      stateRegistration: this.normalizeOptionalText(
        payload.stateRegistration,
        current.stateRegistration,
      ),
      phone: this.normalizeOptionalText(payload.phone, current.phone),
      email: this.normalizeOptionalEmail(payload.email, current.email),
      website: this.normalizeOptionalWebsite(payload.website, current.website),
      addressLine1: this.normalizeOptionalText(
        payload.addressLine1,
        current.addressLine1,
      ),
      addressLine2: this.normalizeOptionalText(
        payload.addressLine2,
        current.addressLine2,
      ),
      district: this.normalizeOptionalText(payload.district, current.district),
      city: this.normalizeOptionalText(payload.city, current.city),
      stateCode: this.normalizeStateCode(payload.stateCode, current.stateCode),
      zipCode: this.normalizeZipCode(payload.zipCode, current.zipCode),
    };
  }

  private normalizeOptionalText(
    value: string | undefined,
    fallback: string | null,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private normalizeOptionalEmail(
    value: string | undefined,
    fallback: string | null,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
  }

  private normalizeOptionalWebsite(
    value: string | undefined,
    fallback: string | null,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    try {
      const url = new URL(normalized);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('invalid-protocol');
      }

      return url.toString();
    } catch {
      throw new BadRequestException(
        'Informe uma URL valida para o website da empresa.',
      );
    }
  }

  private normalizeCnpj(value: string | undefined, fallback: string | null) {
    if (value === undefined) {
      return fallback;
    }

    const digits = value.replace(/\D/g, '');

    if (!digits) {
      return null;
    }

    if (digits.length !== 14) {
      throw new BadRequestException('Informe um CNPJ valido com 14 digitos.');
    }

    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    );
  }

  private normalizeZipCode(value: string | undefined, fallback: string | null) {
    if (value === undefined) {
      return fallback;
    }

    const digits = value.replace(/\D/g, '');

    if (!digits) {
      return null;
    }

    if (digits.length !== 8) {
      throw new BadRequestException('Informe um CEP valido com 8 digitos.');
    }

    return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  }

  private normalizeStateCode(
    value: string | undefined,
    fallback: string | null,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const normalized = value.trim().toUpperCase();

    if (!normalized) {
      return null;
    }

    if (normalized.length !== 2) {
      throw new BadRequestException(
        'Informe a UF com duas letras, por exemplo CE ou SP.',
      );
    }

    return normalized;
  }

  private readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
