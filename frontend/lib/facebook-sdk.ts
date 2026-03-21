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
}

let sdkLoaded = false;

export function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkLoaded && window.FB) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        cookie: true,
        xfbml: false,
        version: 'v23.0',
      });
      sdkLoaded = true;
      resolve();
    };

    if (document.getElementById('facebook-jssdk')) {
      if (window.FB) {
        sdkLoaded = true;
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

export function launchEmbeddedSignup(): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK nao carregado.'));
      return;
    }

    let signupData: { phoneNumberId?: string; wabaId?: string } = {};
    let authCode: string | undefined;
    let settled = false;

    const tryResolve = () => {
      if (settled) return;
      if (authCode && signupData.phoneNumberId && signupData.wabaId) {
        settled = true;
        cleanup();
        resolve({
          code: authCode,
          phoneNumberId: signupData.phoneNumberId,
          wabaId: signupData.wabaId,
        });
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return;
      }

      try {
        const data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          signupData = {
            phoneNumberId: data.data?.phone_number_id,
            wabaId: data.data?.waba_id,
          };
          tryResolve();
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
    };

    window.addEventListener('message', onMessage);

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          authCode = response.authResponse.code;
          tryResolve();

          // If we got the code but no WA_EMBEDDED_SIGNUP event yet, wait a bit
          setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanup();
              if (signupData.phoneNumberId && signupData.wabaId) {
                resolve({
                  code: authCode!,
                  phoneNumberId: signupData.phoneNumberId,
                  wabaId: signupData.wabaId,
                });
              } else {
                reject(
                  new Error(
                    'Signup incompleto: dados do WhatsApp nao recebidos.',
                  ),
                );
              }
            }
          }, 5000);
        } else {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error('Login cancelado ou falhou.'));
          }
        }
      },
      {
        response_type: 'code',
        override_default_response_type: true,
        scope:
          'whatsapp_business_messaging,whatsapp_business_management',
        extras: {
          feature: 'whatsapp_embedded_signup',
          sessionInfoVersion: 2,
        },
      },
    );
  });
}
