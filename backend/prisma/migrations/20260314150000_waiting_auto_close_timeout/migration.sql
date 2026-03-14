-- Add optional timeout for auto-closing conversations that stay in WAITING.
ALTER TABLE "WorkspaceConversationSettings"
ADD COLUMN "waitingAutoCloseTimeoutMinutes" INTEGER;

-- Add explicit close reason to mark automatic unanswered closures.
CREATE TYPE "ConversationCloseReason" AS ENUM ('MANUAL', 'UNANSWERED');

ALTER TABLE "Conversation"
ADD COLUMN "closeReason" "ConversationCloseReason";
