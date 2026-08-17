-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubBranchName" TEXT,
ADD COLUMN "githubBranchUrl" TEXT,
ADD COLUMN "githubBaseBranch" TEXT,
ADD COLUMN "githubBaseSha" TEXT,
ADD COLUMN "githubBranchCreatedAt" TIMESTAMP(3),
ADD COLUMN "githubBranchLastCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_githubBranchName_idx" ON "Task"("githubBranchName");
