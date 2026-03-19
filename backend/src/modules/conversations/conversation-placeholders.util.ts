export const SUPPORTED_CONVERSATION_PLACEHOLDERS = [
  'nome',
  'vendedor',
  'novo_vendedor',
  'empresa',
] as const;

type ConversationPlaceholderKey =
  (typeof SUPPORTED_CONVERSATION_PLACEHOLDERS)[number];

type ConversationPlaceholderMap = Partial<
  Record<ConversationPlaceholderKey, string | null | undefined>
>;

const PLACEHOLDER_REGEX = /\{([a-z_]+)\}/gi;

function normalizePlaceholderValue(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export function resolveConversationPlaceholders(
  template: string,
  placeholders: ConversationPlaceholderMap,
) {
  if (!template) {
    return '';
  }

  return template.replace(
    PLACEHOLDER_REGEX,
    (rawMatch: string, rawKey: string) => {
      const normalizedKey = rawKey.toLowerCase() as ConversationPlaceholderKey;

      if (!(normalizedKey in placeholders)) {
        return rawMatch;
      }

      return normalizePlaceholderValue(placeholders[normalizedKey]);
    },
  );
}
