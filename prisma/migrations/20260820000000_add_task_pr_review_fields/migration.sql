-- AlterTable
ALTER TABLE "Task" ADD COLUMN "githubPrReviewRunId" TEXT,
ADD COLUMN "githubPrReviewStatus" TEXT,
ADD COLUMN "githubPrReviewSummary" TEXT,
ADD COLUMN "githubPrReviewRecommendation" TEXT,
ADD COLUMN "githubPrReviewRiskLevel" TEXT,
ADD COLUMN "githubPrReviewReadyForReview" BOOLEAN,
ADD COLUMN "githubPrReviewLastCheckedAt" TIMESTAMP(3),
ADD COLUMN "githubPrMarkedReadyAt" TIMESTAMP(3);
