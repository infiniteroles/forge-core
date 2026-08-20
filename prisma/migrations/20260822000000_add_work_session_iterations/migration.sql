-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN "parentWorkSessionId" TEXT,
ADD COLUMN "requestedChanges" TEXT,
ADD COLUMN "iterationNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "WorkSession_parentWorkSessionId_idx" ON "WorkSession"("parentWorkSessionId");

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_parentWorkSessionId_fkey" FOREIGN KEY ("parentWorkSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
