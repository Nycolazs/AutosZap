import { ConversationStatus } from '@prisma/client';

const MESSAGE_FORMAT_PREFIX_REGEX = /^\*[^*\n]+\*:\n[\s\S]+$/;

export function formatManualMessageContent(userName: string, content: string) {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();

  if (!normalizedContent) {
    return normalizedContent;
  }

  if (MESSAGE_FORMAT_PREFIX_REGEX.test(normalizedContent)) {
    return normalizedContent;
  }

  return `*${userName.trim().toUpperCase()}*:\n${normalizedContent}`;
}

export function normalizeConversationStatus(
  status: ConversationStatus,
  assignedUserId?: string | null,
) {
  if (status === ConversationStatus.OPEN) {
    return assignedUserId
      ? ConversationStatus.IN_PROGRESS
      : ConversationStatus.OPEN;
  }

  if (status === ConversationStatus.PENDING) {
    return ConversationStatus.WAITING;
  }

  return status;
}
