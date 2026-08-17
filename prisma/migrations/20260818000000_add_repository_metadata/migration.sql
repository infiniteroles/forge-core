-- AlterTable
ALTER TABLE "Project" ADD COLUMN "repositoryUrl" TEXT,
ADD COLUMN "repositoryDefaultBranch" TEXT,
ADD COLUMN "repositoryVisibility" TEXT,
ADD COLUMN "repositoryDescription" TEXT,
ADD COLUMN "repositoryLastCommitSha" TEXT,
ADD COLUMN "repositoryLastCommitMessage" TEXT,
ADD COLUMN "repositoryLastCommitUrl" TEXT,
ADD COLUMN "repositoryLastCommitAt" TIMESTAMP(3),
ADD COLUMN "repositoryLastCheckedAt" TIMESTAMP(3);
