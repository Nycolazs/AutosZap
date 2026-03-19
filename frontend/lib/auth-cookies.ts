export const ACCESS_COOKIE = 'autoszap_access_token';
export const REFRESH_COOKIE = 'autoszap_refresh_token';

export const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function getBackendUrl() {
  const configuredUrl = process.env.BACKEND_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:4000';
  }

  throw new Error('BACKEND_URL nao configurada para o frontend em producao.');
}

export function getBackendUnavailableMessage() {
  const configuredUrl = process.env.BACKEND_URL?.trim();

  if (process.env.NODE_ENV === 'development') {
    if (configuredUrl) {
      return `Backend indisponivel em ${configuredUrl}.`;
    }

    return 'Backend local indisponivel. Verifique se a API do AutosZap esta rodando na porta 4000.';
  }

  return 'Servico do AutosZap indisponivel no momento. Tente novamente em instantes.';
}

export async function readBackendJson(response: Response) {
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
