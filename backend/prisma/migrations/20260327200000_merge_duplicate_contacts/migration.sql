-- Normalize Brazilian phone numbers missing the 9th digit and merge duplicates.
-- Pattern: +55DDXXXXXXXX (12 chars) where 3rd national digit is 6-9
-- Correct: +55DD9XXXXXXXX (13 chars)

-- Helper view: map each unnormalized dup contact to its normalized keeper contact.
CREATE TEMP TABLE _contact_merge AS
SELECT
  dup.id AS dup_id,
  keeper.id AS keeper_id,
  dup."workspaceId"
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Helper: map dup conversations to keeper conversations (same instanceId).
CREATE TEMP TABLE _conv_merge AS
SELECT
  dc.id AS dup_conv_id,
  kc.id AS keeper_conv_id
FROM "Conversation" dc
JOIN _contact_merge cm ON dc."contactId" = cm.dup_id
JOIN "Conversation" kc
  ON kc."contactId" = cm.keeper_id
  AND kc."workspaceId" = cm."workspaceId"
  AND kc."deletedAt" IS NULL
  AND (kc."instanceId" IS NOT DISTINCT FROM dc."instanceId")
WHERE dc."deletedAt" IS NULL;

-- ============================================================================
-- STEP 1: Merge conflicting conversations (move children, soft-delete dup conv)
-- ============================================================================

-- Move messages from dup conversations to keeper conversations.
UPDATE "ConversationMessage" SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE "conversationId" = m.dup_conv_id;

-- Move notes.
UPDATE "ConversationNote" SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE "conversationId" = m.dup_conv_id;

-- Move events.
UPDATE "ConversationEvent" SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE "conversationId" = m.dup_conv_id;

-- Move assignments.
UPDATE "ConversationAssignment" SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE "conversationId" = m.dup_conv_id;

-- Delete tags from dup conversations.
DELETE FROM "ConversationTag" ct
USING _conv_merge m WHERE ct."conversationId" = m.dup_conv_id;

-- Delete participants from dup conversations.
DELETE FROM "ConversationParticipant" cp
USING _conv_merge m WHERE cp."conversationId" = m.dup_conv_id;

-- Delete reminders from dup conversations.
DELETE FROM "ConversationReminder" cr
USING _conv_merge m WHERE cr."conversationId" = m.dup_conv_id;

-- Soft-delete conflicting dup conversations.
UPDATE "Conversation" SET "deletedAt" = NOW()
FROM _conv_merge m WHERE id = m.dup_conv_id;

-- ============================================================================
-- STEP 2: Reassign non-conflicting conversations (different or no instanceId).
-- ============================================================================

UPDATE "Conversation" c SET "contactId" = cm.keeper_id
FROM _contact_merge cm
WHERE c."contactId" = cm.dup_id AND c."deletedAt" IS NULL;

-- ============================================================================
-- STEP 3: Reassign remaining child records from dup contacts to keeper.
-- ============================================================================

-- Conversation messages.
UPDATE "ConversationMessage" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Conversation participants.
UPDATE "ConversationParticipant" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Contact tags (delete conflicts first).
DELETE FROM "ContactTag" ct
USING _contact_merge cm
WHERE ct."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactTag" e WHERE e."contactId" = cm.keeper_id AND e."tagId" = ct."tagId"
  );

UPDATE "ContactTag" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Contact list items (delete conflicts first).
DELETE FROM "ContactListItem" cli
USING _contact_merge cm
WHERE cli."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactListItem" e WHERE e."contactId" = cm.keeper_id AND e."listId" = cli."listId"
  );

UPDATE "ContactListItem" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Group members (delete conflicts first).
DELETE FROM "GroupMember" gm
USING _contact_merge cm
WHERE gm."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "GroupMember" e WHERE e."contactId" = cm.keeper_id AND e."groupId" = gm."groupId"
  );

UPDATE "GroupMember" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Campaign recipients.
UPDATE "CampaignRecipient" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- Leads.
UPDATE "Lead" SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE "contactId" = cm.dup_id;

-- ============================================================================
-- STEP 4: Soft-delete the duplicate contacts.
-- ============================================================================

UPDATE "Contact" SET "deletedAt" = NOW()
FROM _contact_merge cm WHERE id = cm.dup_id;

-- ============================================================================
-- STEP 5: Normalize remaining unnormalized phones (no duplicate existed).
-- ============================================================================

UPDATE "Contact"
SET phone = '+55' || LEFT(SUBSTRING(phone FROM 4), 2) || '9' || SUBSTRING(phone FROM 6),
    "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND phone ~ '^\+55\d{10}$'
  AND SUBSTRING(phone, 6, 1) IN ('6','7','8','9');

-- Cleanup.
DROP TABLE _conv_merge;
DROP TABLE _contact_merge;
