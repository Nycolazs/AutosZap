BEGIN;

CREATE TEMP TABLE _cm AS
SELECT dup.id AS dup_id, keeper.id AS keeper_id, dup."workspaceId" AS ws_id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

CREATE TEMP TABLE _cvm AS
SELECT dc.id AS dup_conv_id, kc.id AS keeper_conv_id
FROM "Conversation" dc
JOIN _cm ON dc."contactId" = _cm.dup_id
JOIN "Conversation" kc
  ON kc."contactId" = _cm.keeper_id
  AND kc."workspaceId" = _cm.ws_id
  AND kc."deletedAt" IS NULL
  AND (kc."instanceId" IS NOT DISTINCT FROM dc."instanceId")
WHERE dc."deletedAt" IS NULL;

-- Move messages from conflicting conversations
UPDATE "ConversationMessage" SET "conversationId" = _cvm.keeper_conv_id
FROM _cvm WHERE "ConversationMessage"."conversationId" = _cvm.dup_conv_id;

-- Move notes
UPDATE "ConversationNote" SET "conversationId" = _cvm.keeper_conv_id
FROM _cvm WHERE "ConversationNote"."conversationId" = _cvm.dup_conv_id;

-- Move events
UPDATE "ConversationEvent" SET "conversationId" = _cvm.keeper_conv_id
FROM _cvm WHERE "ConversationEvent"."conversationId" = _cvm.dup_conv_id;

-- Move assignments
UPDATE "ConversationAssignment" SET "conversationId" = _cvm.keeper_conv_id
FROM _cvm WHERE "ConversationAssignment"."conversationId" = _cvm.dup_conv_id;

-- Delete tags/participants/reminders from dup conversations
DELETE FROM "ConversationTag" USING _cvm WHERE "ConversationTag"."conversationId" = _cvm.dup_conv_id;
DELETE FROM "ConversationParticipant" USING _cvm WHERE "ConversationParticipant"."conversationId" = _cvm.dup_conv_id;
DELETE FROM "ConversationReminder" USING _cvm WHERE "ConversationReminder"."conversationId" = _cvm.dup_conv_id;

-- Soft-delete conflicting conversations
UPDATE "Conversation" SET "deletedAt" = NOW() FROM _cvm WHERE "Conversation".id = _cvm.dup_conv_id;

-- Reassign remaining non-conflicting conversations
UPDATE "Conversation" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "Conversation"."contactId" = _cm.dup_id AND "Conversation"."deletedAt" IS NULL;

-- Reassign messages senderContactId
UPDATE "ConversationMessage" SET "senderContactId" = _cm.keeper_id
FROM _cm WHERE "ConversationMessage"."senderContactId" = _cm.dup_id;

-- Reassign participants
UPDATE "ConversationParticipant" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "ConversationParticipant"."contactId" = _cm.dup_id;

-- Contact tags
DELETE FROM "ContactTag"
USING _cm
WHERE "ContactTag"."contactId" = _cm.dup_id
  AND EXISTS (SELECT 1 FROM "ContactTag" e WHERE e."contactId" = _cm.keeper_id AND e."tagId" = "ContactTag"."tagId");
UPDATE "ContactTag" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "ContactTag"."contactId" = _cm.dup_id;

-- Contact list items
DELETE FROM "ContactListItem"
USING _cm
WHERE "ContactListItem"."contactId" = _cm.dup_id
  AND EXISTS (SELECT 1 FROM "ContactListItem" e WHERE e."contactId" = _cm.keeper_id AND e."listId" = "ContactListItem"."listId");
UPDATE "ContactListItem" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "ContactListItem"."contactId" = _cm.dup_id;

-- Group members
DELETE FROM "GroupMember"
USING _cm
WHERE "GroupMember"."contactId" = _cm.dup_id
  AND EXISTS (SELECT 1 FROM "GroupMember" e WHERE e."contactId" = _cm.keeper_id AND e."groupId" = "GroupMember"."groupId");
UPDATE "GroupMember" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "GroupMember"."contactId" = _cm.dup_id;

-- Campaign recipients
UPDATE "CampaignRecipient" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "CampaignRecipient"."contactId" = _cm.dup_id;

-- Leads
UPDATE "Lead" SET "contactId" = _cm.keeper_id
FROM _cm WHERE "Lead"."contactId" = _cm.dup_id;

-- Soft-delete duplicate contacts
UPDATE "Contact" SET "deletedAt" = NOW() FROM _cm WHERE "Contact".id = _cm.dup_id;

-- Normalize remaining unnormalized phones
UPDATE "Contact"
SET phone = '+55' || LEFT(SUBSTRING(phone FROM 4), 2) || '9' || SUBSTRING(phone FROM 6),
    "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND phone ~ '^\+55\d{10}$'
  AND SUBSTRING(phone, 6, 1) IN ('6','7','8','9');

DROP TABLE _cvm;
DROP TABLE _cm;

COMMIT;
