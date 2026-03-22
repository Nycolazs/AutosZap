declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init(params: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }): void;
      login(
        callback: (response: {
          authResponse?: { code?: string; accessToken?: string };
          status?: string;
        }) => void,
        options: {
          config_id?: string;
          auth_type?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          scope?: string;
          extras?: Record<string, unknown>;
        },
      ): void;
    };
  }
}

export interface EmbeddedSignupResult {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string;
}

type LoadFacebookSdkOptions = {
  appId: string;
  graphApiVersion?: string;
};

type LaunchEmbeddedSignupOptions = {
  appId: string;
  configurationId: string;
  graphApiVersion?: string;
  bridgeBaseUrl?: string;
};

type LaunchEmbeddedSignupViaBridgeOptions = LaunchEmbeddedSignupOptions & {
  openerOrigin: string;
};

type EmbeddedSignupMessagePayload = {
  type?: string;
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    business_id?: string;
    current_step?: string;
    error_message?: string;
    error_id?: string;
  };
};

type EmbeddedSignupBridgeMessage =
  | {
      type: typeof EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE;
      success: true;
      result: EmbeddedSignupResult;
    }
  | {
      type: typeof EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE;
      success: false;
      error: string;
    };

const FACEBOOK_SCRIPT_ID = 'facebook-jssdk';
const DEFAULT_GRAPH_API_VERSION = 'v22.0';
const FACEBOOK_ORIGINS = new Set([
  'https://www.facebook.com',
  'https://web.facebook.com',
]);
export const AUTOSZAP_PUBLIC_APP_URL = 'https://autoszap.com';
export const EMBEDDED_SIGNUP_BRIDGE_PATH = '/embedded-signup';
export const EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE =
  'AUTOSZAP_EMBEDDED_SIGNUP_RESULT';

let sdkLoadPromise: Promise<void> | null = null;
let initializedSdkKey: string | null = null;

function ensureBrowserEnvironment() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Facebook SDK indisponivel fora do navegador.');
  }
}

function initFacebookSdk(appId: string, graphApiVersion: string) {
  if (!window.FB) {
    throw new Error('Facebook SDK nao carregado.');
  }

  const sdkKey = `${appId}:${graphApiVersion}`;
  if (initializedSdkKey === sdkKey) {
    return;
  }

  window.FB.init({
    appId,
    cookie: true,
    xfbml: false,
    version: graphApiVersion,
  });
  initializedSdkKey = sdkKey;
}

async function waitForFacebookSdk(timeoutMs = 10000) {
  const startedAt = Date.now();

  while (!window.FB) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Tempo esgotado ao carregar o Facebook SDK.');
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}

function parseEmbeddedSignupMessage(rawData: unknown) {
  if (!rawData) {
    return null;
  }

  if (typeof rawData === 'string') {
    try {
      return JSON.parse(rawData) as EmbeddedSignupMessagePayload;
    } catch {
      return null;
    }
  }

  if (typeof rawData === 'object') {
    return rawData as EmbeddedSignupMessagePayload;
  }

  return null;
}

function isEmbeddedSignupBridgeMessage(
  rawData: unknown,
): rawData is EmbeddedSignupBridgeMessage {
  if (!rawData || typeof rawData !== 'object') {
    return false;
  }

  const candidate = rawData as Partial<EmbeddedSignupBridgeMessage>;
  return candidate.type === EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE;
}

function getEmbeddedSignupEventMessage(payload: EmbeddedSignupMessagePayload) {
  const eventName = payload.event?.toUpperCase();

  if (eventName === 'FINISH_ONLY_WABA') {
    return 'A WABA foi criada, mas nenhum numero foi conectado. Finalize a conexao do numero no fluxo da Meta.';
  }

  if (eventName === 'CANCEL') {
    const currentStep = payload.data?.current_step;
    return currentStep
      ? `Fluxo cancelado na etapa "${currentStep}".`
      : 'Fluxo cancelado antes da conclusao.';
  }

  const errorMessage = payload.data?.error_message?.trim();
  if (errorMessage) {
    return errorMessage;
  }

  return 'Nao foi possivel concluir o Embedded Signup da Meta.';
}

function normalizeBaseUrl(value?: string | null) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue.replace(/\/+$/, '') : null;
}

function isHostedAppOrigin(baseUrl?: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const resolvedBaseUrl = normalizeBaseUrl(baseUrl) ?? AUTOSZAP_PUBLIC_APP_URL;

  try {
    return window.location.origin === new URL(resolvedBaseUrl).origin;
  } catch {
    return false;
  }
}

function buildPopupFeatures() {
  if (typeof window === 'undefined') {
    return 'popup=yes,width=540,height=760,resizable=yes,scrollbars=yes';
  }

  const width = 540;
  const height = 760;
  const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0);
  const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0);

  return [
    'popup=yes',
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
}

export function buildEmbeddedSignupBridgeUrl({
  appId,
  configurationId,
  graphApiVersion = DEFAULT_GRAPH_API_VERSION,
  bridgeBaseUrl,
  openerOrigin,
}: LaunchEmbeddedSignupViaBridgeOptions) {
  const resolvedBaseUrl = normalizeBaseUrl(bridgeBaseUrl) ?? AUTOSZAP_PUBLIC_APP_URL;
  const bridgeUrl = new URL(EMBEDDED_SIGNUP_BRIDGE_PATH, resolvedBaseUrl);

  bridgeUrl.searchParams.set('appId', appId);
  bridgeUrl.searchParams.set('configurationId', configurationId);
  bridgeUrl.searchParams.set('graphApiVersion', graphApiVersion);
  bridgeUrl.searchParams.set('origin', openerOrigin);
  bridgeUrl.searchParams.set('autoStart', '1');

  return bridgeUrl.toString();
}

export function loadFacebookSdk({
  appId,
  graphApiVersion = DEFAULT_GRAPH_API_VERSION,
}: LoadFacebookSdkOptions): Promise<void> {
  ensureBrowserEnvironment();

  if (window.FB) {
    initFacebookSdk(appId, graphApiVersion);
    return Promise.resolve();
  }

  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise<void>((resolve, reject) => {
      const previousAsyncInit = window.fbAsyncInit;
      const completeInitialization = () => {
        try {
          initFacebookSdk(appId, graphApiVersion);
          resolve();
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Falha ao inicializar o Facebook SDK.'),
          );
        }
      };

      window.fbAsyncInit = () => {
        try {
          previousAsyncInit?.();
        } finally {
          completeInitialization();
        }
      };

      const existingScript = document.getElementById(FACEBOOK_SCRIPT_ID);
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = FACEBOOK_SCRIPT_ID;
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          sdkLoadPromise = null;
          reject(new Error('Falha ao carregar o script do Facebook SDK.'));
        };
        document.head.appendChild(script);
      }

      waitForFacebookSdk()
        .then(() => {
          completeInitialization();
        })
        .catch((error) => {
          sdkLoadPromise = null;
          reject(
            error instanceof Error
              ? error
              : new Error('Falha ao carregar o Facebook SDK.'),
          );
        });
    });
  }

  return sdkLoadPromise.then(() => {
    initFacebookSdk(appId, graphApiVersion);
  });
}

function launchEmbeddedSignupWithFacebookSdk({
  configurationId,
}: Pick<LaunchEmbeddedSignupOptions, 'configurationId'>): Promise<EmbeddedSignupResult> {
  ensureBrowserEnvironment();

  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK nao carregado.'));
      return;
    }

    let settled = false;
    let authCode: string | null = null;
    let signupResult: Omit<EmbeddedSignupResult, 'code'> | null = null;

    const cleanupCallbacks: Array<() => void> = [];

    const settleWithError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupCallbacks.forEach((callback) => callback());
      reject(error);
    };

    const settleWithSuccess = () => {
      if (settled || !authCode || !signupResult?.phoneNumberId || !signupResult.wabaId) {
        return;
      }

      settled = true;
      cleanupCallbacks.forEach((callback) => callback());
      resolve({
        code: authCode,
        phoneNumberId: signupResult.phoneNumberId,
        wabaId: signupResult.wabaId,
        businessId: signupResult.businessId,
      });
    };

    const timeoutId = window.setTimeout(() => {
      settleWithError(
        new Error('Tempo esgotado aguardando a conclusao do Embedded Signup.'),
      );
    }, 120000);
    cleanupCallbacks.push(() => window.clearTimeout(timeoutId));

    const onMessage = (event: MessageEvent) => {
      if (!FACEBOOK_ORIGINS.has(event.origin)) {
        return;
      }

      const payload = parseEmbeddedSignupMessage(event.data);
      if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') {
        return;
      }

      const eventName = payload.event?.toUpperCase();
      if (
        eventName === 'CANCEL' ||
        eventName === 'ERROR' ||
        eventName === 'FINISH_ONLY_WABA'
      ) {
        settleWithError(new Error(getEmbeddedSignupEventMessage(payload)));
        return;
      }

      if (
        eventName === 'FINISH' ||
        eventName === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
      ) {
        signupResult = {
          phoneNumberId: payload.data?.phone_number_id ?? '',
          wabaId: payload.data?.waba_id ?? '',
          businessId: payload.data?.business_id,
        };

        if (!signupResult.phoneNumberId || !signupResult.wabaId) {
          settleWithError(
            new Error(
              'A Meta concluiu o fluxo, mas nao retornou phone_number_id e waba_id.',
            ),
          );
          return;
        }

        settleWithSuccess();
      }
    };

    window.addEventListener('message', onMessage);
    cleanupCallbacks.push(() => window.removeEventListener('message', onMessage));

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          authCode = response.authResponse.code;
          settleWithSuccess();
          return;
        }

        settleWithError(new Error('Fluxo cancelado ou nao autorizado na Meta.'));
      },
      {
        config_id: configurationId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      },
    );
  });
}

export async function launchEmbeddedSignupDirect({
  appId,
  configurationId,
  graphApiVersion = DEFAULT_GRAPH_API_VERSION,
}: LaunchEmbeddedSignupOptions) {
  await loadFacebookSdk({
    appId,
    graphApiVersion,
  });

  return launchEmbeddedSignupWithFacebookSdk({
    configurationId,
  });
}

function launchEmbeddedSignupViaBridge({
  appId,
  configurationId,
  graphApiVersion = DEFAULT_GRAPH_API_VERSION,
  bridgeBaseUrl,
  openerOrigin,
}: LaunchEmbeddedSignupViaBridgeOptions): Promise<EmbeddedSignupResult> {
  ensureBrowserEnvironment();

  const bridgeUrl = buildEmbeddedSignupBridgeUrl({
    appId,
    configurationId,
    graphApiVersion,
    bridgeBaseUrl,
    openerOrigin,
  });
  const targetOrigin = new URL(bridgeUrl).origin;
  const popupWindow = window.open(
    bridgeUrl,
    'autoszap-embedded-signup',
    buildPopupFeatures(),
  );

  if (!popupWindow) {
    throw new Error(
      'O navegador bloqueou a janela segura da Meta. Libere popups e tente novamente.',
    );
  }

  popupWindow.focus();

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanupCallbacks: Array<() => void> = [];

    const settleWithError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupCallbacks.forEach((callback) => callback());
      reject(error);
    };

    const settleWithSuccess = (result: EmbeddedSignupResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupCallbacks.forEach((callback) => callback());
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin || !isEmbeddedSignupBridgeMessage(event.data)) {
        return;
      }

      if (event.data.success) {
        settleWithSuccess(event.data.result);
        return;
      }

      settleWithError(
        new Error(event.data.error || 'Nao foi possivel concluir o Embedded Signup.'),
      );
    };

    window.addEventListener('message', onMessage);
    cleanupCallbacks.push(() => window.removeEventListener('message', onMessage));

    const closeWatcher = window.setInterval(() => {
      if (!popupWindow.closed) {
        return;
      }

      window.clearInterval(closeWatcher);
      settleWithError(
        new Error('A janela do Embedded Signup foi fechada antes da conclusao.'),
      );
    }, 500);
    cleanupCallbacks.push(() => window.clearInterval(closeWatcher));
  });
}

export function launchEmbeddedSignup(
  options: LaunchEmbeddedSignupOptions,
): Promise<EmbeddedSignupResult> {
  ensureBrowserEnvironment();

  if (isHostedAppOrigin(options.bridgeBaseUrl)) {
    return launchEmbeddedSignupDirect(options);
  }

  return launchEmbeddedSignupViaBridge({
    ...options,
    openerOrigin: window.location.origin,
  });
}
