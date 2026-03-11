import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createAuditLog } from '../../common/utils/audit';
import {
  generateSecureToken,
  hashOpaqueToken,
  parseDurationToMs,
} from '../../common/utils/auth';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';

interface AuthUserPayload {
  sub: string;
  email: string;
  name: string;
  workspaceId: string;
  role: Role;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new BadRequestException('Ja existe uma conta com este email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const slug = `${dto.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()
      .toString()
      .slice(-4)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: dto.companyName,
          slug,
          companyName: dto.companyName,
          settings: {
            locale: 'pt-BR',
            timezone: 'America/Fortaleza',
            theme: 'dark-blue',
          },
        },
      });

      const user = await tx.user.create({
        data: {
          workspaceId: workspace.id,
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          title: 'Administrador',
        },
      });

      await tx.teamMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          invitedById: user.id,
          name: user.name,
          email: user.email,
          title: user.title,
          role: user.role,
          status: UserStatus.ACTIVE,
        },
      });

      return { workspace, user };
    });

    return this.issueSession(result.user, {
      workspaceName: result.workspace.name,
      workspaceSlug: result.workspace.slug,
    });
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { workspace: true },
    });

    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!matches) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createAuditLog(
      this.prisma,
      user.workspaceId,
      AuditAction.LOGIN,
      'user',
      user.id,
      user.id,
      {
        userAgent,
        ipAddress,
      },
    );

    return this.issueSession(user, {
      workspaceName: user.workspace.name,
      workspaceSlug: user.workspace.slug,
      userAgent,
      ipAddress,
    });
  }

  async refresh(dto: RefreshDto, userAgent?: string, ipAddress?: string) {
    const hashedToken = hashOpaqueToken(dto.refreshToken);
    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: true },
    });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(existingToken.user, {
      userAgent,
      ipAddress,
    });
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          tokenHash: hashOpaqueToken(refreshToken),
        },
        data: { revokedAt: new Date() },
      });
      return { success: true };
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      return { success: true };
    }

    const token = generateSecureToken(20);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
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

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(dto.token) },
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

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { workspace: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      status: user.status,
      workspace: {
        id: user.workspace.id,
        name: user.workspace.name,
        slug: user.workspace.slug,
        companyName: user.workspace.companyName,
      },
    };
  }

  private async issueSession(
    user: {
      id: string;
      email: string;
      name: string;
      workspaceId: string;
      role: Role;
    },
    meta?: {
      workspaceName?: string;
      workspaceSlug?: string;
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const payload: AuthUserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      workspaceId: user.workspaceId,
      role: user.role,
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
          'autozap-access-secret',
        expiresIn: accessExpiresIn as never,
      }),
      this.prisma.refreshToken.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.id,
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
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
      },
      workspace:
        meta?.workspaceName && meta.workspaceSlug
          ? {
              name: meta.workspaceName,
              slug: meta.workspaceSlug,
            }
          : undefined,
    };
  }
}
