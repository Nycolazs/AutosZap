import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CurrentAuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantConnectionService } from '../tenancy/tenant-connection.service';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentAuthUser }>();
    const user = request.user;

    if (!user) {
      return true;
    }

    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    this.prismaService.patchTenantContext({
      userId: user.sub,
      companyId: user.companyId ?? undefined,
      workspaceId: user.workspaceId ?? undefined,
      isPlatformRoute,
    });

    if (isPlatformRoute) {
      if (user.platformRole == null) {
        throw new ForbiddenException(
          'Acesso permitido apenas para administradores da plataforma.',
        );
      }

      return true;
    }

    if (!user.companyId || !user.workspaceId) {
      throw new UnauthorizedException(
        'Nenhuma empresa ativa encontrada para este usuario.',
      );
    }

    const tenantClient = await this.tenantConnectionService.getTenantClient(
      user.companyId,
    );

    this.prismaService.patchTenantContext({
      tenantId: user.companyId,
      tenantClient,
    });

    return true;
  }
}
