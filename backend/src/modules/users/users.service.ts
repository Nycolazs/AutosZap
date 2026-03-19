import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.user.findMany({
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
      },
    });
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

    return workspace;
  }

  async updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string;
      companyName?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: payload.name ?? workspace.name,
        companyName: payload.companyName ?? workspace.companyName,
        settings: (payload.settings ?? workspace.settings ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }
}
