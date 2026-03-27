-- Normalize Brazilian phone numbers that are missing the 9th digit.
-- Pattern: +55 DD XXXX XXXX (12 digits) where 3rd national digit is 6-9
-- Should be: +55 DD 9XXXX XXXX (13 digits)
--
-- Strategy: For duplicate contacts, move all child records to the keeper
-- contact, then soft-delete duplicate contacts and their orphaned conversations.

-- ============================================================================
-- STEP 1: Handle CONFLICTING conversations (same keeper contact + instanceId).
--         Move messages from dup conversation to keeper conversation, then
--         soft-delete the dup conversation.
-- ============================================================================

-- Move messages from conflicting dup conversations to the keeper's conversation.
UPDATE "ConversationMessage" cm
SET "conversationId" = keeper_conv.id
FROM "Conversation" dup_conv
JOIN "Contact" dup ON dup_conv."contactId" = dup.id
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
JOIN "Conversation" keeper_conv
  ON keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (
    (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
  )
WHERE cm."conversationId" = dup_conv.id
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Move notes from conflicting dup conversations.
UPDATE "ConversationNote" cn
SET "conversationId" = keeper_conv.id
FROM "Conversation" dup_conv
JOIN "Contact" dup ON dup_conv."contactId" = dup.id
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
JOIN "Conversation" keeper_conv
  ON keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
WHERE cn."conversationId" = dup_conv.id
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Move events from conflicting dup conversations.
UPDATE "ConversationEvent" ce
SET "conversationId" = keeper_conv.id
FROM "Conversation" dup_conv
JOIN "Contact" dup ON dup_conv."contactId" = dup.id
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
JOIN "Conversation" keeper_conv
  ON keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
WHERE ce."conversationId" = dup_conv.id
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Move assignments from conflicting dup conversations.
UPDATE "ConversationAssignment" ca
SET "conversationId" = keeper_conv.id
FROM "Conversation" dup_conv
JOIN "Contact" dup ON dup_conv."contactId" = dup.id
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
JOIN "Conversation" keeper_conv
  ON keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
WHERE ca."conversationId" = dup_conv.id
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Delete conversation tags from conflicting dup conversations (avoid unique conflicts).
DELETE FROM "ConversationTag" ct
USING "Conversation" dup_conv,
      "Contact" dup,
      "Contact" keeper,
      "Conversation" keeper_conv
WHERE ct."conversationId" = dup_conv.id
  AND dup_conv."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Delete participants from conflicting dup conversations.
DELETE FROM "ConversationParticipant" cp
USING "Conversation" dup_conv,
      "Contact" dup,
      "Contact" keeper,
      "Conversation" keeper_conv
WHERE cp."conversationId" = dup_conv.id
  AND dup_conv."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Delete reminders from conflicting dup conversations.
DELETE FROM "ConversationReminder" cr
USING "Conversation" dup_conv,
      "Contact" dup,
      "Contact" keeper,
      "Conversation" keeper_conv
WHERE cr."conversationId" = dup_conv.id
  AND dup_conv."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Soft-delete the conflicting dup conversations (their children were moved above).
UPDATE "Conversation" dup_conv
SET "deletedAt" = NOW()
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
JOIN "Conversation" keeper_conv
  ON keeper_conv."contactId" = keeper.id
  AND keeper_conv."workspaceId" = dup."workspaceId"
  AND keeper_conv."deletedAt" IS NULL
  AND (keeper_conv."instanceId" IS NOT DISTINCT FROM dup_conv."instanceId")
WHERE dup_conv."contactId" = dup.id
  AND dup_conv."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- ============================================================================
-- STEP 2: Handle NON-CONFLICTING conversations (no matching keeper conversation
--         for that instanceId). Just reassign contactId to the keeper.
-- ============================================================================

UPDATE "Conversation" c
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE c."contactId" = dup.id
  AND c."deletedAt" IS NULL
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- ============================================================================
-- STEP 3: Reassign remaining child records from dup contacts to keeper.
-- ============================================================================

-- Conversation messages.
UPDATE "ConversationMessage" cm
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE cm."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Conversation participants.
UPDATE "ConversationParticipant" cp
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE cp."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Contact tags (delete duplicates first, then reassign).
DELETE FROM "ContactTag" ct
USING "Contact" dup,
      "Contact" keeper
WHERE ct."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9')
  AND EXISTS (
    SELECT 1 FROM "ContactTag" existing
    WHERE existing."contactId" = keeper.id AND existing."tagId" = ct."tagId"
  );

UPDATE "ContactTag" ct
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE ct."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Contact list items (delete duplicates first, then reassign).
DELETE FROM "ContactListItem" cli
USING "Contact" dup,
      "Contact" keeper
WHERE cli."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9')
  AND EXISTS (
    SELECT 1 FROM "ContactListItem" existing
    WHERE existing."contactId" = keeper.id AND existing."listId" = cli."listId"
  );

UPDATE "ContactListItem" cli
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE cli."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Group members (delete duplicates first, then reassign).
DELETE FROM "GroupMember" gm
USING "Contact" dup,
      "Contact" keeper
WHERE gm."contactId" = dup.id
  AND keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9')
  AND EXISTS (
    SELECT 1 FROM "GroupMember" existing
    WHERE existing."contactId" = keeper.id AND existing."groupId" = gm."groupId"
  );

UPDATE "GroupMember" gm
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE gm."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Campaign recipients.
UPDATE "CampaignRecipient" cr
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE cr."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Leads.
UPDATE "Lead" l
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE l."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- ============================================================================
-- STEP 4: Soft-delete the duplicate unnormalized contacts.
-- ============================================================================

UPDATE "Contact" dup
SET "deletedAt" = NOW()
FROM "Contact" keeper
WHERE keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- ============================================================================
-- STEP 5: Normalize remaining unnormalized Brazilian phones (no duplicate).
-- ============================================================================

UPDATE "Contact"
SET phone = '+55' || LEFT(SUBSTRING(phone FROM 4), 2) || '9' || SUBSTRING(phone FROM 6),
    "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND phone ~ '^\+55\d{10}$'
  AND SUBSTRING(phone, 6, 1) IN ('6','7','8','9');
