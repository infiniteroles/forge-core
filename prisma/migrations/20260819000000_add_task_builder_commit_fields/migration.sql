-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubBuilderCommitSha" TEXT,
ADD COLUMN "githubBuilderCommitUrl" TEXT,
ADD COLUMN "githubBuilderCommitMessage" TEXT,
ADD COLUMN "githubBuilderCommittedAt" TIMESTAMP(3),
ADD COLUMN "githubBuilderLastCheckedAt" TIMESTAMP(3),
ADD COLUMN "builderLastRunId" TEXT,
ADD COLUMN "builderLastStatus" TEXT,
ADD COLUMN "builderLastSummary" TEXT;
