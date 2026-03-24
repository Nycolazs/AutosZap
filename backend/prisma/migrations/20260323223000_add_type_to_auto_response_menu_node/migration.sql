-- Hotfix: some environments have AutoResponseMenuNode without the type column.
ALTER TABLE "AutoResponseMenuNode"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'message';
