import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookieOptions, getBackendUrl } from '@/lib/auth-cookies';

async function readJsonPayload(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      message: 'Resposta invalida recebida do backend.',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await readJsonPayload(response);

    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    const cookieStore = await cookies();
    cookieStore.set(ACCESS_COOKIE, String(payload.accessToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 15,
    });
    cookieStore.set(REFRESH_COOKIE, String(payload.refreshToken ?? ''), {
      ...authCookieOptions,
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({
      user: payload.user,
      workspace: payload.workspace,
    });
  } catch {
    return NextResponse.json(
      {
        message:
          'Backend local indisponivel. Verifique se a API do AutosZap esta rodando na porta 4000.',
      },
      { status: 503 },
    );
  }
}
