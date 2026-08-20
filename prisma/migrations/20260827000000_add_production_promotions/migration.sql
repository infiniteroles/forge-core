-- CreateTable
CREATE TABLE "ProductionPromotion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "workSessionId" TEXT,
    "productionReadinessReviewId" TEXT,
    "previewDeploymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "strategy" TEXT NOT NULL DEFAULT 'github_pr_merge',
    "summary" TEXT,
    "error" TEXT,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "branchName" TEXT,
    "baseBranch" TEXT,
    "mergeCommitSha" TEXT,
    "mergeMethod" TEXT,
    "preflightSummary" JSONB,
    "deploymentSummary" JSONB,
    "verificationSummary" JSONB,
    "metadata" JSONB,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionPromotion_projectId_idx" ON "ProductionPromotion"("projectId");

-- CreateIndex
CREATE INDEX "ProductionPromotion_taskId_idx" ON "ProductionPromotion"("taskId");

-- CreateIndex
CREATE INDEX "ProductionPromotion_workSessionId_idx" ON "ProductionPromotion"("workSessionId");

-- CreateIndex
CREATE INDEX "ProductionPromotion_productionReadinessReviewId_idx" ON "ProductionPromotion"("productionReadinessReviewId");

-- CreateIndex
CREATE INDEX "ProductionPromotion_previewDeploymentId_idx" ON "ProductionPromotion"("previewDeploymentId");

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_productionReadinessReviewId_fkey" FOREIGN KEY ("productionReadinessReviewId") REFERENCES "ProductionReadinessReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_previewDeploymentId_fkey" FOREIGN KEY ("previewDeploymentId") REFERENCES "PreviewDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
