import { ConversationStatus } from '@prisma/client';
import {
  formatManualMessageContent,
  normalizeConversationStatus,
} from './conversation-workflow.utils';

describe('conversation-workflow.utils', () => {
  describe('formatManualMessageContent', () => {
    it('adds the seller name prefix once and preserves line breaks', () => {
      expect(formatManualMessageContent('Ana Clara', 'Oi,\nTudo bem?')).toBe(
        '*ANA CLARA*:\nOi,\nTudo bem?',
      );
    });

    it('does not duplicate an existing formatted signature', () => {
      const content = '*ANA CLARA*:\nOi, tudo bem?';

      expect(formatManualMessageContent('Ana Clara', content)).toBe(content);
    });

    it('returns an empty string when the message only contains whitespace', () => {
      expect(formatManualMessageContent('Ana Clara', '   \n\t')).toBe('');
    });
  });

  describe('normalizeConversationStatus', () => {
    it('keeps open conversations without assignee as OPEN (sem status)', () => {
      expect(normalizeConversationStatus(ConversationStatus.OPEN, null)).toBe(
        ConversationStatus.OPEN,
      );
    });

    it('maps legacy open conversations with assignee to IN_PROGRESS', () => {
      expect(
        normalizeConversationStatus(ConversationStatus.OPEN, 'seller-1'),
      ).toBe(ConversationStatus.IN_PROGRESS);
    });

    it('maps legacy pending conversations to WAITING', () => {
      expect(normalizeConversationStatus(ConversationStatus.PENDING)).toBe(
        ConversationStatus.WAITING,
      );
    });

    it('keeps new statuses unchanged', () => {
      expect(normalizeConversationStatus(ConversationStatus.RESOLVED)).toBe(
        ConversationStatus.RESOLVED,
      );
    });
  });
});
