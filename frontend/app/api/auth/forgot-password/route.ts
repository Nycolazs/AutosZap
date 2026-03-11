import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const response = await fetch(`${getBackendUrl()}/api/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return NextResponse.json(await response.json(), { status: response.status });
}
