-- Normalize Brazilian phone numbers that are missing the 9th digit.
-- Pattern: +55 DD XXXX XXXX (12 digits) where 3rd national digit is 6-9
-- Should be: +55 DD 9XXXX XXXX (13 digits)
--
-- Step 1: For contacts whose phone can be normalized AND a contact with the
--         normalized phone already exists in the same workspace, merge them:
--         reassign conversations, messages, tags, list items, etc.
--
-- Step 2: Soft-delete the unnormalized duplicate contacts.
--
-- Step 3: Normalize remaining contacts that have no conflict.

-- Reassign conversations from unnormalized contacts to their normalized counterparts.
UPDATE "Conversation" c
SET "contactId" = keeper.id
FROM "Contact" dup
JOIN "Contact" keeper
  ON keeper."workspaceId" = dup."workspaceId"
  AND keeper.phone = '+55' || LEFT(SUBSTRING(dup.phone FROM 4), 2) || '9' || SUBSTRING(dup.phone FROM 6)
  AND keeper."deletedAt" IS NULL
  AND keeper.id != dup.id
WHERE c."contactId" = dup.id
  AND dup."deletedAt" IS NULL
  AND dup.phone ~ '^\+55\d{10}$'
  AND SUBSTRING(dup.phone, 6, 1) IN ('6','7','8','9');

-- Reassign conversation messages from unnormalized contacts.
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

-- Reassign conversation participants.
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

-- Reassign contact tags (skip if already exists on keeper).
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

-- Reassign contact list items (skip duplicates).
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

-- Reassign group members (skip duplicates).
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

-- Reassign campaign recipients.
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

-- Reassign leads.
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

-- Soft-delete the duplicate unnormalized contacts (that had a normalized counterpart).
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

-- Soft-delete orphaned conversations (conversations whose contact was just soft-deleted).
UPDATE "Conversation" c
SET "deletedAt" = NOW()
FROM "Contact" contact
WHERE c."contactId" = contact.id
  AND contact."deletedAt" IS NOT NULL
  AND c."deletedAt" IS NULL;

-- Normalize remaining unnormalized Brazilian phones that had NO duplicate
-- (the contact exists but with old format only).
UPDATE "Contact"
SET phone = '+55' || LEFT(SUBSTRING(phone FROM 4), 2) || '9' || SUBSTRING(phone FROM 6),
    "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND phone ~ '^\+55\d{10}$'
  AND SUBSTRING(phone, 6, 1) IN ('6','7','8','9');
