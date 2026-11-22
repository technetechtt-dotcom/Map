-- Stakeholder content repository: groups, memberships, document metadata and group ACLs.
CREATE TABLE "RepositoryGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "provinceId" TEXT,
  "organisationId" TEXT,
  "createdById" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepositoryGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "tagsJson" JSONB NOT NULL DEFAULT '[]',
  "visibility" TEXT NOT NULL DEFAULT 'GROUPS',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "storedObjectId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "provinceId" TEXT,
  "organisationId" TEXT,
  "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepositoryDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryDocumentGroup" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryDocumentGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryGroup_name_provinceId_organisationId_key" ON "RepositoryGroup"("name","provinceId","organisationId");
CREATE INDEX "RepositoryGroup_provinceId_active_idx" ON "RepositoryGroup"("provinceId","active");
CREATE INDEX "RepositoryGroup_organisationId_active_idx" ON "RepositoryGroup"("organisationId","active");

CREATE UNIQUE INDEX "RepositoryGroupMember_groupId_userId_key" ON "RepositoryGroupMember"("groupId","userId");
CREATE INDEX "RepositoryGroupMember_userId_groupId_idx" ON "RepositoryGroupMember"("userId","groupId");

CREATE UNIQUE INDEX "RepositoryDocument_storedObjectId_key" ON "RepositoryDocument"("storedObjectId");
CREATE INDEX "RepositoryDocument_provinceId_status_createdAt_idx" ON "RepositoryDocument"("provinceId","status","createdAt");
CREATE INDEX "RepositoryDocument_organisationId_status_createdAt_idx" ON "RepositoryDocument"("organisationId","status","createdAt");
CREATE INDEX "RepositoryDocument_uploadedById_createdAt_idx" ON "RepositoryDocument"("uploadedById","createdAt");
CREATE INDEX "RepositoryDocument_category_idx" ON "RepositoryDocument"("category");
CREATE INDEX "RepositoryDocument_visibility_idx" ON "RepositoryDocument"("visibility");

CREATE UNIQUE INDEX "RepositoryDocumentGroup_documentId_groupId_key" ON "RepositoryDocumentGroup"("documentId","groupId");
CREATE INDEX "RepositoryDocumentGroup_groupId_documentId_idx" ON "RepositoryDocumentGroup"("groupId","documentId");

ALTER TABLE "RepositoryGroupMember" ADD CONSTRAINT "RepositoryGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RepositoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryGroupMember" ADD CONSTRAINT "RepositoryGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryDocument" ADD CONSTRAINT "RepositoryDocument_storedObjectId_fkey" FOREIGN KEY ("storedObjectId") REFERENCES "StoredObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepositoryDocument" ADD CONSTRAINT "RepositoryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepositoryDocument" ADD CONSTRAINT "RepositoryDocument_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RepositoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepositoryDocumentGroup" ADD CONSTRAINT "RepositoryDocumentGroup_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RepositoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryDocumentGroup" ADD CONSTRAINT "RepositoryDocumentGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RepositoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
