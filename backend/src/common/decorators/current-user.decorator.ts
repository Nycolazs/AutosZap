import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentAuthUser {
  sub: string;
  email: string;
  name: string;
  workspaceId: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'SELLER';
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentAuthUser }>();

    if (!request.user) {
      throw new Error('Authenticated user is not available in request');
    }

    return request.user;
  },
);
