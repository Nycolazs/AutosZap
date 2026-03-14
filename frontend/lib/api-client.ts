export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class AuthRedirectError extends Error {
  constructor() {
    super('Redirecionando para login.');
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname.startsWith('/login')) {
    return;
  }

  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = `/login?next=${encodeURIComponent(next)}`;
  window.location.replace(loginUrl);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const response = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'include',
    body:
      options.body === undefined || options.body === null || options.method === 'GET'
        ? undefined
        : isFormData
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      redirectToLogin();
      throw new AuthRedirectError();
    }

    throw new ApiError('Sessao expirada.', 401);
  }

  if (!response.ok) {
    let message = 'Ocorreu um erro ao processar a requisicao.';

    try {
      const data = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(data.message) ? data.message.join(', ') : data.message ?? message;
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
