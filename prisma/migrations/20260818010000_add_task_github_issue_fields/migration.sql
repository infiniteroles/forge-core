-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubIssueNumber" INTEGER,
ADD COLUMN "githubIssueUrl" TEXT,
ADD COLUMN "githubIssueState" TEXT,
ADD COLUMN "githubIssueTitle" TEXT,
ADD COLUMN "githubIssueCreatedAt" TIMESTAMP(3),
ADD COLUMN "githubIssueUpdatedAt" TIMESTAMP(3),
ADD COLUMN "githubIssueLastCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_githubIssueNumber_idx" ON "Task"("githubIssueNumber");
