import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { normalizeRole } from '../../modules/access-control/permissions.constants';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CurrentAuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPlatformRoute) {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentAuthUser }>();

    if (!request.user) {
      return false;
    }

    const normalizedRequestedRole = normalizeRole(request.user.role as never);
    const normalizedAllowedRoles = roles.map((role) =>
      normalizeRole(role as never),
    );

    return normalizedAllowedRoles.includes(normalizedRequestedRole);
  }
}
