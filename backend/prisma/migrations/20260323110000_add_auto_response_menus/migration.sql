-- CreateTable
CREATE TABLE "AutoResponseMenu" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "triggerKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "headerText" TEXT,
    "footerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoResponseMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoResponseMenuNode" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoResponseMenuNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoResponseMenu_workspaceId_idx" ON "AutoResponseMenu"("workspaceId");

-- CreateIndex
CREATE INDEX "AutoResponseMenuNode_menuId_idx" ON "AutoResponseMenuNode"("menuId");

-- CreateIndex
CREATE INDEX "AutoResponseMenuNode_parentId_idx" ON "AutoResponseMenuNode"("parentId");

-- AddForeignKey
ALTER TABLE "AutoResponseMenu" ADD CONSTRAINT "AutoResponseMenu_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoResponseMenuNode" ADD CONSTRAINT "AutoResponseMenuNode_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "AutoResponseMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoResponseMenuNode" ADD CONSTRAINT "AutoResponseMenuNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AutoResponseMenuNode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
