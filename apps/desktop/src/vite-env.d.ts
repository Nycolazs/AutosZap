/// <reference types="vite/client" />

declare global {
  interface Window {
    autoszapDesktop: {
      getSession: () => Promise<unknown>;
      setSession: (session: unknown) => Promise<boolean>;
      clearSession: () => Promise<boolean>;
      notify: (payload: {
        title: string;
        body: string;
        linkHref?: string;
      }) => Promise<boolean>;
      getVersion: () => Promise<string>;
      openExternal: (target: string) => Promise<void>;
      onOpenLink: (callback: (linkHref: string | null) => void) => () => void;
    };
  }
}

export {};
