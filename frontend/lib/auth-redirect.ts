import { apiRequest } from '@/lib/api-client';
import { getFirstAccessibleAppPath } from '@/lib/permissions';
import type { AuthMeResponse } from '@/lib/types';

export async function resolvePostAuthRedirect() {
  const me = await apiRequest<AuthMeResponse>('auth/me');

  if (me.platform?.isPlatformAdmin) {
    return '/platform';
  }

  return getFirstAccessibleAppPath(me.permissionMap);
}
