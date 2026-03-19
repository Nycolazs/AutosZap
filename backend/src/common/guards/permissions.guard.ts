import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import {
  PERMISSIONS_KEY,
  PermissionRequirement,
} from '../decorators/permissions.decorator';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import { CurrentAuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPlatformRoute) {
      return true;
    }

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement?.permissions.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentAuthUser }>();

    if (!request.user) {
      return false;
    }

    const snapshot = await this.accessControlService.getUserPermissions(
      request.user.sub,
      request.user.workspaceId,
    );

    if (requirement.mode === 'any') {
      return requirement.permissions.some(
        (permission) => snapshot.permissionMap[permission],
      );
    }

    return requirement.permissions.every(
      (permission) => snapshot.permissionMap[permission],
    );
  }
}
