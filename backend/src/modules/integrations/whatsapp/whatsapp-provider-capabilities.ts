import { InstanceProvider } from '@prisma/client';

export type WhatsAppProviderCapabilities = {
  embeddedSignup: boolean;
  templates: boolean;
  businessProfile: boolean;
  webhookSubscription: boolean;
  qrLogin: boolean;
  reconnect: boolean;
  logout: boolean;
  diagnostics: boolean;
  freeformText: boolean;
  freeformMedia: boolean;
  interactiveMessages: boolean;
  enforces24HourWindow: boolean;
};

export function getWhatsAppProviderCapabilities(
  provider: InstanceProvider,
): WhatsAppProviderCapabilities {
  if (provider === InstanceProvider.WHATSAPP_WEB) {
    return {
      embeddedSignup: false,
      templates: false,
      businessProfile: false,
      webhookSubscription: false,
      qrLogin: true,
      reconnect: true,
      logout: true,
      diagnostics: true,
      freeformText: true,
      freeformMedia: true,
      interactiveMessages: false,
      enforces24HourWindow: false,
    };
  }

  return {
    embeddedSignup: true,
    templates: true,
    businessProfile: true,
    webhookSubscription: true,
    qrLogin: false,
    reconnect: false,
    logout: false,
    diagnostics: true,
    freeformText: true,
    freeformMedia: true,
    interactiveMessages: true,
    enforces24HourWindow: true,
  };
}
