-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubPrNumber" INTEGER,
ADD COLUMN "githubPrUrl" TEXT,
ADD COLUMN "githubPrState" TEXT,
ADD COLUMN "githubPrTitle" TEXT,
ADD COLUMN "githubPrDraft" BOOLEAN,
ADD COLUMN "githubPrBaseBranch" TEXT,
ADD COLUMN "githubPrHeadBranch" TEXT,
ADD COLUMN "githubPrCreatedAt" TIMESTAMP(3),
ADD COLUMN "githubPrUpdatedAt" TIMESTAMP(3),
ADD COLUMN "githubPrMergedAt" TIMESTAMP(3),
ADD COLUMN "githubPrLastCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_githubPrNumber_idx" ON "Task"("githubPrNumber");
