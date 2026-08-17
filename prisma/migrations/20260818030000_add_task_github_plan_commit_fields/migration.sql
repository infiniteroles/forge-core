-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubPlanPath" TEXT,
ADD COLUMN "githubPlanCommitSha" TEXT,
ADD COLUMN "githubPlanCommitUrl" TEXT,
ADD COLUMN "githubPlanCommitMessage" TEXT,
ADD COLUMN "githubPlanCommittedAt" TIMESTAMP(3),
ADD COLUMN "githubPlanLastCheckedAt" TIMESTAMP(3);
