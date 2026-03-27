-- Normalize Brazilian phone numbers missing the 9th digit and merge duplicates.

-- Map each unnormalized dup contact to its normalized keeper contact.
CREATE TEMP TABLE _contact_merge AS
SELECT
  dup.id AS dup_id,
  keeper.id AS keeper_id,
  dup."workspaceId" AS ws_id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Map dup conversations to keeper conversations (same instanceId).
CREATE TEMP TABLE _conv_merge AS
SELECT
  dc.id AS dup_conv_id,
  kc.id AS keeper_conv_id
FROM "Conversation" dc
JOIN _contact_merge cm ON dc."contactId" = cm.dup_id
JOIN "Conversation" kc
  ON kc."contactId" = cm.keeper_id
  AND kc."workspaceId" = cm.ws_id
  AND kc."deletedAt" IS NULL
  AND (kc."instanceId" IS NOT DISTINCT FROM dc."instanceId")
WHERE dc."deletedAt" IS NULL;

-- STEP 1: Merge conflicting conversations.

UPDATE "ConversationMessage" msg
SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE msg."conversationId" = m.dup_conv_id;

UPDATE "ConversationNote" n
SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE n."conversationId" = m.dup_conv_id;

UPDATE "ConversationEvent" e
SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE e."conversationId" = m.dup_conv_id;

UPDATE "ConversationAssignment" a
SET "conversationId" = m.keeper_conv_id
FROM _conv_merge m WHERE a."conversationId" = m.dup_conv_id;

DELETE FROM "ConversationTag" t
USING _conv_merge m WHERE t."conversationId" = m.dup_conv_id;

DELETE FROM "ConversationParticipant" p
USING _conv_merge m WHERE p."conversationId" = m.dup_conv_id;

DELETE FROM "ConversationReminder" r
USING _conv_merge m WHERE r."conversationId" = m.dup_conv_id;

UPDATE "Conversation" c
SET "deletedAt" = NOW()
FROM _conv_merge m WHERE c.id = m.dup_conv_id;

-- STEP 2: Reassign non-conflicting conversations.

UPDATE "Conversation" c
SET "contactId" = cm.keeper_id
FROM _contact_merge cm
WHERE c."contactId" = cm.dup_id AND c."deletedAt" IS NULL;

-- STEP 3: Reassign child records from dup contacts to keeper.

UPDATE "ConversationMessage" msg
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE msg."contactId" = cm.dup_id;

UPDATE "ConversationParticipant" p
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE p."contactId" = cm.dup_id;

DELETE FROM "ContactTag" ct
USING _contact_merge cm
WHERE ct."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactTag" e WHERE e."contactId" = cm.keeper_id AND e."tagId" = ct."tagId"
  );

UPDATE "ContactTag" ct
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE ct."contactId" = cm.dup_id;

DELETE FROM "ContactListItem" cli
USING _contact_merge cm
WHERE cli."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactListItem" e WHERE e."contactId" = cm.keeper_id AND e."listId" = cli."listId"
  );

UPDATE "ContactListItem" cli
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE cli."contactId" = cm.dup_id;

DELETE FROM "GroupMember" gm
USING _contact_merge cm
WHERE gm."contactId" = cm.dup_id
  AND EXISTS (
    SELECT 1 FROM "GroupMember" e WHERE e."contactId" = cm.keeper_id AND e."groupId" = gm."groupId"
  );

UPDATE "GroupMember" gm
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE gm."contactId" = cm.dup_id;

UPDATE "CampaignRecipient" cr
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE cr."contactId" = cm.dup_id;

UPDATE "Lead" l
SET "contactId" = cm.keeper_id
FROM _contact_merge cm WHERE l."contactId" = cm.dup_id;

-- STEP 4: Soft-delete duplicate contacts.

UPDATE "Contact" c
SET "deletedAt" = NOW()
FROM _contact_merge cm WHERE c.id = cm.dup_id;

-- STEP 5: Normalize remaining unnormalized phones.

UPDATE "Contact"
SET phone = '+55' || LEFT(SUBSTRING(phone FROM 4), 2) || '9' || SUBSTRING(phone FROM 6),
    "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND phone ~ '^\+55\d{10}$'
  AND SUBSTRING(phone, 6, 1) IN ('6','7','8','9');

DROP TABLE _conv_merge;
DROP TABLE _contact_merge;
